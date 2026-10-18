from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from catalog.factories import create_product
from catalog.models import Category, ProductSize
from orders.models import Cart, CartItem, Order, OrderItem
from orders.tokens import make_payment_token
from payments.models import PaymentTransaction

CALLBACK_SECRET = "test-cb-secret-123"

User = get_user_model()


def callback_url(token: str = CALLBACK_SECRET) -> str:
    return reverse("mpesa-callback", kwargs={"token": token})


def success_payload(checkout_request_id, amount=3500.00, receipt="QGH8876543"):
    return {
        "Body": {
            "stkCallback": {
                "MerchantRequestID": "MR_CALLBACK",
                "CheckoutRequestID": checkout_request_id,
                "ResultCode": 0,
                "ResultDesc": "The service request is processed successfully.",
                "CallbackMetadata": {
                    "Item": [
                        {"Name": "Amount", "Value": amount},
                        {"Name": "MpesaReceiptNumber", "Value": receipt},
                        {"Name": "PhoneNumber", "Value": 254712345678},
                    ]
                },
            }
        }
    }


@override_settings(MPESA_ENVIRONMENT="mock", MPESA_CALLBACK_SECRET=CALLBACK_SECRET)
class MpesaPaymentTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        # Guest order (no user) - the ownership token is its only proof.
        self.order = Order.objects.create(
            order_number="WAYAZ-2610-9999",
            email="shopper@example.com",
            phone_number="0712345678",
            shipping_name="Jane Doe",
            county="Nairobi",
            town="Westlands",
            street_address="Mpaka Rd",
            total_amount=Decimal("3500.00"),
            payment_method=Order.PaymentMethod.M_PESA,
            payment_status=Order.PaymentStatus.PENDING,
        )
        self.token = make_payment_token(self.order)

    def _make_tx(self, checkout_request_id="ws_CO_123456"):
        return PaymentTransaction.objects.create(
            order=self.order,
            merchant_request_id="MR123",
            checkout_request_id=checkout_request_id,
            amount=self.order.total_amount,
            phone_number="254712345678",
            status=PaymentTransaction.Status.PENDING,
        )

    def test_stk_push_initiate_mock(self):
        url = reverse("mpesa-stk-push")
        data = {
            "order_number": self.order.order_number,
            "phone_number": "0712345678",
            "payment_token": self.token,
        }
        response = self.client.post(url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("checkout_request_id", response.data)
        self.assertTrue(response.data["is_mock"])

        tx = PaymentTransaction.objects.get(
            checkout_request_id=response.data["checkout_request_id"]
        )
        self.assertEqual(tx.order, self.order)
        self.assertEqual(tx.status, PaymentTransaction.Status.PENDING)

    def test_stk_push_rejected_without_ownership(self):
        """A bare order_number must not be enough to prompt someone's phone."""
        url = reverse("mpesa-stk-push")
        base = {
            "order_number": self.order.order_number,
            "phone_number": "0712345678",
        }
        # No token at all.
        response = self.client.post(url, base, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        # Garbage token.
        response = self.client.post(
            url, {**base, "payment_token": "not-a-real-token"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(PaymentTransaction.objects.count(), 0)

    def test_stk_push_allowed_for_authenticated_owner(self):
        owner = User.objects.create_user(username="owner", password="pw12345!")
        self.order.user = owner
        self.order.save()
        self.client.force_authenticate(user=owner)
        url = reverse("mpesa-stk-push")
        response = self.client.post(
            url,
            {
                "order_number": self.order.order_number,
                "phone_number": "0712345678",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_stk_push_rejected_for_authenticated_non_owner(self):
        stranger = User.objects.create_user(username="stranger", password="pw12345!")
        self.client.force_authenticate(user=stranger)
        url = reverse("mpesa-stk-push")
        response = self.client.post(
            url,
            {
                "order_number": self.order.order_number,
                "phone_number": "0712345678",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_payment_status_polling(self):
        tx = self._make_tx("ws_CO_123456")
        url = reverse(
            "payment-status", kwargs={"checkout_request_id": tx.checkout_request_id}
        )
        response = self.client.get(url, {"payment_token": self.token})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "PENDING")

    def test_payment_status_polling_requires_ownership(self):
        tx = self._make_tx("ws_CO_noperm")
        url = reverse(
            "payment-status", kwargs={"checkout_request_id": tx.checkout_request_id}
        )
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        response = self.client.get(url, {"payment_token": "bogus"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(MPESA_ENVIRONMENT="sandbox")
    def test_status_poll_recovers_payment_when_callback_never_arrives(self):
        """The callback is best-effort, so polling itself asks Safaricom: a
        paid attempt whose callback was lost still flips the order to PAID."""
        cache.clear()
        self._make_hold()
        tx = self._make_tx("ws_CO_RECOVER_OK")
        url = reverse(
            "payment-status", kwargs={"checkout_request_id": tx.checkout_request_id}
        )
        with patch(
            "payments.views.stk_query",
            return_value={
                "ResultCode": "0",
                "ResultDesc": "The service request is processed successfully.",
            },
        ) as query:
            response = self.client.get(url, {"payment_token": self.token})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        query.assert_called_once_with(tx.checkout_request_id)
        self.assertEqual(response.data["status"], "COMPLETED")
        self.assertEqual(response.data["payment_status"], Order.PaymentStatus.PAID)
        tx.refresh_from_db()
        self.order.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.Status.COMPLETED)
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.PAID)
        # Payment reveals the hold; staff confirm it later.
        self.assertEqual(self.order.status, Order.Status.PROCESSING)

    @override_settings(MPESA_ENVIRONMENT="sandbox")
    def test_status_poll_releases_hold_when_attempt_failed(self):
        """A lost failure callback must not leave the hold blocking checkouts:
        polling resolves it and reports the release."""
        cache.clear()
        self._make_hold()
        tx = self._make_tx("ws_CO_RECOVER_FAIL")
        url = reverse(
            "payment-status", kwargs={"checkout_request_id": tx.checkout_request_id}
        )
        with patch(
            "payments.views.stk_query",
            return_value={
                "ResultCode": "1032",
                "ResultDesc": "Request cancelled by user",
            },
        ):
            response = self.client.get(url, {"payment_token": self.token})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "FAILED")
        self.assertEqual(response.data["result_desc"], "Request cancelled by user")
        # The release cascades the unpaid hold and its transactions away.
        self.assertFalse(Order.objects.filter(pk=self.order.pk).exists())
        self.assertFalse(PaymentTransaction.objects.filter(pk=tx.pk).exists())

    def test_status_poll_never_calls_daraja_in_mock_mode(self):
        """Mock results come from the simulate endpoint only - the fake
        stk_query would claim success for any request."""
        cache.clear()
        tx = self._make_tx("ws_CO_MOCK_NOSYNC")
        url = reverse(
            "payment-status", kwargs={"checkout_request_id": tx.checkout_request_id}
        )
        with patch("payments.views.stk_query") as query:
            response = self.client.get(url, {"payment_token": self.token})

        query.assert_not_called()
        self.assertEqual(response.data["status"], "PENDING")

    @override_settings(MPESA_ENVIRONMENT="sandbox")
    def test_status_poll_queries_daraja_at_most_once_per_cooldown(self):
        """The modal polls every couple of seconds; Daraja hears about the
        attempt at most once per cooldown window."""
        cache.clear()
        tx = self._make_tx("ws_CO_COOLDOWN")
        url = reverse(
            "payment-status", kwargs={"checkout_request_id": tx.checkout_request_id}
        )
        with patch("payments.views.stk_query", return_value=None) as query:
            first = self.client.get(url, {"payment_token": self.token})
            second = self.client.get(url, {"payment_token": self.token})

        self.assertEqual(query.call_count, 1)
        self.assertEqual(first.data["status"], "PENDING")
        self.assertEqual(second.data["status"], "PENDING")

    def test_mock_simulate_success(self):
        tx = self._make_tx("ws_CO_789012")
        url = reverse("mock-simulate")
        data = {
            "checkout_request_id": tx.checkout_request_id,
            "action": "success",
        }
        response = self.client.post(url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        tx.refresh_from_db()
        self.order.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.Status.COMPLETED)
        self.assertIsNotNone(tx.mpesa_receipt_number)
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.PAID)
        # Payment does not confirm; staff do that, so it stays PROCESSING.
        self.assertEqual(self.order.status, Order.Status.PROCESSING)

    def _make_hold(self, cart_item_ids=None):
        self.order.status = Order.Status.AWAITING_PAYMENT
        self.order.checkout_cart_item_ids = cart_item_ids
        self.order.save()

    @override_settings(MANAGER_EMAIL="boss@wayaz.co.ke")
    def test_mock_simulate_reveals_hold_and_clears_purchased_cart_lines(self):
        category = Category.objects.create(name="Denim", slug="denim")
        product = create_product(
            title="Stale Jeans",
            category=category,
            base_price=Decimal("3500.00"),
            stock_quantity=5,
        )
        cart = Cart.objects.create()
        bought = CartItem.objects.create(cart=cart, product=product, quantity=2)
        kept = CartItem.objects.create(cart=cart, product=product, size="32")
        self._make_hold([bought.id])

        tx = self._make_tx("ws_CO_HOLD_1")
        response = self.client.post(
            reverse("mock-simulate"),
            {"checkout_request_id": tx.checkout_request_id, "action": "success"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.PROCESSING)
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.PAID)
        # Only the purchased line left the cart; a line added mid-PIN stays.
        self.assertFalse(CartItem.objects.filter(id=bought.id).exists())
        self.assertTrue(CartItem.objects.filter(id=kept.id).exists())
        # Shopper and merchant both hear about it - and only now.
        self.assertEqual(len(mail.outbox), 2)
        self.assertEqual(
            [m.to for m in mail.outbox if "boss@wayaz.co.ke" in m.to],
            [["boss@wayaz.co.ke"]],
        )

    @override_settings(MANAGER_EMAIL="boss@wayaz.co.ke")
    def test_daraja_callback_reveals_held_order(self):
        self._make_hold()
        tx = self._make_tx("ws_CO_HOLD_CB")
        response = self.client.post(
            callback_url(), success_payload(tx.checkout_request_id), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.PROCESSING)
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.PAID)
        self.assertEqual(len(mail.outbox), 2)

    def _reserve_stock_on_hold(self):
        """A product with 2 of its 5 units reserved by the payment hold,
        mimicking what CheckoutView does before the STK push goes out."""
        category = Category.objects.create(name="Denim", slug="denim")
        product = create_product(
            title="Reserved Jeans",
            category=category,
            base_price=Decimal("3500.00"),
            stock_quantity=5,
        )
        ProductSize.objects.filter(product=product, size="").update(quantity=3)
        OrderItem.objects.create(
            order=self.order,
            product=product,
            product_title=product.title,
            unit_price=Decimal("1750.00"),
            quantity=2,
        )
        self._make_hold()
        return product

    @staticmethod
    def _fail_payload(transaction, code=1032, desc="Request cancelled by user"):
        return {
            "Body": {
                "stkCallback": {
                    "MerchantRequestID": transaction.merchant_request_id,
                    "CheckoutRequestID": transaction.checkout_request_id,
                    "ResultCode": code,
                    "ResultDesc": desc,
                }
            }
        }

    def test_failed_callback_releases_stock_and_drops_hold(self):
        """A cancelled PIN hands the reserved stock back immediately instead
        of leaving it held until the cron sweep, and drops the unpaid hold so
        the shopper can check out again at once."""
        product = self._reserve_stock_on_hold()
        tx = self._make_tx("ws_CO_HOLD_FAIL")

        response = self.client.post(
            callback_url(), self._fail_payload(tx), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Hold and its transaction are gone; the 2 reserved units are back.
        self.assertFalse(Order.objects.filter(pk=self.order.pk).exists())
        self.assertFalse(PaymentTransaction.objects.filter(pk=tx.pk).exists())
        product.refresh_from_db()
        self.assertEqual(product.total_stock, 5)
        # Nothing ordered, nobody emailed.
        self.assertEqual(len(mail.outbox), 0)

    def test_failed_attempt_never_touches_a_paid_order(self):
        """A late failure callback for an already-paid order must not undo
        the payment or restock sold units."""
        self.order.payment_status = Order.PaymentStatus.PAID
        self.order.status = Order.Status.PROCESSING
        self.order.save()
        tx = self._make_tx("ws_CO_LATE_FAIL")

        response = self.client.post(
            callback_url(), self._fail_payload(tx), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        tx.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.Status.FAILED)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.PROCESSING)
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.PAID)

    def test_failure_of_one_attempt_keeps_hold_while_another_is_pending(self):
        """A retry can still be awaiting its PIN prompt: only the last
        unresolved attempt may release the hold."""
        self._make_hold()
        failing = self._make_tx("ws_CO_RETRY_FAIL")
        PaymentTransaction.objects.create(
            order=self.order,
            merchant_request_id="MR2",
            checkout_request_id="ws_CO_RETRY_LIVE",
            amount=self.order.total_amount,
            phone_number="254712345678",
            status=PaymentTransaction.Status.PENDING,
        )

        response = self.client.post(
            callback_url(), self._fail_payload(failing), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        failing.refresh_from_db()
        self.assertEqual(failing.status, PaymentTransaction.Status.FAILED)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.AWAITING_PAYMENT)
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.PENDING)

    def test_mock_simulate_fail_releases_hold(self):
        """The mock cancel button takes the same release path as the real
        failure callback."""
        product = self._reserve_stock_on_hold()
        tx = self._make_tx("ws_CO_MOCK_FAIL")

        response = self.client.post(
            reverse("mock-simulate"),
            {"checkout_request_id": tx.checkout_request_id, "action": "fail"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.assertFalse(Order.objects.filter(pk=self.order.pk).exists())
        self.assertFalse(PaymentTransaction.objects.filter(pk=tx.pk).exists())
        product.refresh_from_db()
        self.assertEqual(product.total_stock, 5)

    @override_settings(MPESA_ENVIRONMENT="sandbox")
    def test_mock_simulate_disabled_outside_mock_mode(self):
        """The fake-payment endpoint must be dead outside local dev."""
        tx = self._make_tx("ws_CO_sandbox")
        url = reverse("mock-simulate")
        response = self.client.post(
            url,
            {"checkout_request_id": tx.checkout_request_id, "action": "success"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        tx.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.Status.PENDING)

    def test_daraja_callback_webhook(self):
        tx = self._make_tx("ws_CO_CALLBACK_123")
        response = self.client.post(
            callback_url(), success_payload(tx.checkout_request_id), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        tx.refresh_from_db()
        self.order.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.Status.COMPLETED)
        self.assertEqual(tx.mpesa_receipt_number, "QGH8876543")
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.PAID)

    def test_daraja_callback_rejects_wrong_token(self):
        tx = self._make_tx("ws_CO_WRONGTOKEN")
        response = self.client.post(
            callback_url("the-wrong-secret"),
            success_payload(tx.checkout_request_id),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        tx.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.Status.PENDING)

    @override_settings(MPESA_CALLBACK_SECRET="")
    def test_daraja_callback_rejects_when_secret_unconfigured(self):
        """No shared secret = the webhook is rejected, never trusted."""
        tx = self._make_tx("ws_CO_NOSECRET")
        response = self.client.post(
            callback_url("any-token-at-all"),
            success_payload(tx.checkout_request_id),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        tx.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.Status.PENDING)

    def test_daraja_callback_amount_mismatch_is_flagged_not_paid(self):
        tx = self._make_tx("ws_CO_MISMATCH")
        # Callback claims a different amount than we asked this order to pay.
        payload = success_payload(tx.checkout_request_id, amount=100.00)
        response = self.client.post(callback_url(), payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        tx.refresh_from_db()
        self.order.refresh_from_db()
        self.assertNotEqual(tx.status, PaymentTransaction.Status.COMPLETED)
        self.assertNotEqual(self.order.payment_status, Order.PaymentStatus.PAID)
        # The audit trail is still stored for manual verification.
        self.assertIsNotNone(tx.raw_callback_payload)

    def test_daraja_callback_rejects_spoofed_success_when_query_disagrees(self):
        """Callback says paid, Daraja's own query says otherwise: no payment."""
        tx = self._make_tx("ws_CO_SPOOF")
        with patch(
            "payments.views.stk_query",
            return_value={
                "ResultCode": 1032,
                "ResultDesc": "Request cancelled by user",
            },
        ):
            response = self.client.post(
                callback_url(), success_payload(tx.checkout_request_id), format="json"
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        tx.refresh_from_db()
        self.order.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.Status.FAILED)
        self.assertNotEqual(self.order.payment_status, Order.PaymentStatus.PAID)

    def test_daraja_callback_retries_when_verification_unavailable(self):
        """Gateway down during re-verification: 503 so Safaricom redelivers."""
        tx = self._make_tx("ws_CO_RETRANSMIT")
        with patch("payments.views.stk_query", return_value=None):
            response = self.client.post(
                callback_url(), success_payload(tx.checkout_request_id), format="json"
            )
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        tx.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.Status.PENDING)

    def test_late_duplicate_callback_acks_without_second_reveal(self):
        """A webhook arriving after direct reconciliation resolved the
        attempt must not email the shopper and merchant again; it only
        backfills the receipt the query could not carry."""
        tx = self._make_tx("ws_CO_LATE_OK")
        tx.status = PaymentTransaction.Status.COMPLETED
        tx.result_code = 0
        tx.save()
        self.order.payment_status = Order.PaymentStatus.PAID
        self.order.save()

        response = self.client.post(
            callback_url(), success_payload(tx.checkout_request_id), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        tx.refresh_from_db()
        self.order.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.Status.COMPLETED)
        self.assertEqual(tx.mpesa_receipt_number, "QGH8876543")
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.PAID)
        # No second reveal happened.
        self.assertEqual(len(mail.outbox), 0)

    def test_cancel_unpaid_hold_releases_stock_and_deletes_hold(self):
        product = self._reserve_stock_on_hold()
        self._make_tx("ws_CO_CANCEL_HOLD")
        url = reverse("mpesa-cancel")

        response = self.client.post(
            url,
            {"order_number": self.order.order_number, "payment_token": self.token},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "CANCELLED")

        # Hold and transactions are gone, reserved stock is restored
        self.assertFalse(Order.objects.filter(pk=self.order.pk).exists())
        product.refresh_from_db()
        self.assertEqual(product.total_stock, 5)

    def test_cancel_requires_order_ownership(self):
        self._make_hold()
        url = reverse("mpesa-cancel")

        # No token
        res1 = self.client.post(
            url, {"order_number": self.order.order_number}, format="json"
        )
        self.assertEqual(res1.status_code, status.HTTP_403_FORBIDDEN)

        # Invalid token
        res2 = self.client.post(
            url,
            {"order_number": self.order.order_number, "payment_token": "bad-token"},
            format="json",
        )
        self.assertEqual(res2.status_code, status.HTTP_403_FORBIDDEN)

    def test_cancel_rejected_when_order_already_paid(self):
        self.order.payment_status = Order.PaymentStatus.PAID
        self.order.save()
        url = reverse("mpesa-cancel")

        response = self.client.post(
            url,
            {"order_number": self.order.order_number, "payment_token": self.token},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already marked as paid", response.data["detail"])

    @override_settings(MPESA_ENVIRONMENT="sandbox")
    def test_cancel_reveals_order_if_daraja_already_confirmed_payment(self):
        self._make_hold()
        self._make_tx("ws_CO_ALREADY_PAID_ON_PHONE")
        url = reverse("mpesa-cancel")

        with patch(
            "payments.views.stk_query",
            return_value={
                "ResultCode": "0",
                "ResultDesc": "The service request is processed successfully.",
            },
        ):
            response = self.client.post(
                url,
                {"order_number": self.order.order_number, "payment_token": self.token},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "COMPLETED")
        self.order.refresh_from_db()
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.PAID)
        self.assertEqual(self.order.status, Order.Status.PROCESSING)

    def test_stk_push_initiate_failure_releases_hold(self):
        product = self._reserve_stock_on_hold()
        url = reverse("mpesa-stk-push")

        with patch(
            "payments.views.initiate_stk_push",
            side_effect=RuntimeError("Daraja network timeout"),
        ):
            response = self.client.post(
                url,
                {
                    "order_number": self.order.order_number,
                    "phone_number": "0712345678",
                    "payment_token": self.token,
                },
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        # Empty hold was released so customer is not trapped
        self.assertFalse(Order.objects.filter(pk=self.order.pk).exists())
        product.refresh_from_db()
        self.assertEqual(product.total_stock, 5)

    def test_stk_push_rejected_for_zero_amount(self):
        self.order.total_amount = Decimal("0.00")
        self.order.save()
        url = reverse("mpesa-stk-push")

        response = self.client.post(
            url,
            {
                "order_number": self.order.order_number,
                "phone_number": "0712345678",
                "payment_token": self.token,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("greater than zero", response.data["detail"])

    def test_stk_push_rejected_for_cancelled_order(self):
        self.order.status = Order.Status.CANCELLED
        self.order.save()
        url = reverse("mpesa-stk-push")

        response = self.client.post(
            url,
            {
                "order_number": self.order.order_number,
                "phone_number": "0712345678",
                "payment_token": self.token,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cancelled", response.data["detail"])

    def test_format_phone_number_variants(self):
        from payments.daraja import format_phone_number

        self.assertEqual(format_phone_number("0712345678"), "254712345678")
        self.assertEqual(format_phone_number("0112345678"), "254112345678")
        self.assertEqual(format_phone_number("+254 712 345 678"), "254712345678")
        self.assertEqual(format_phone_number("+2540712345678"), "254712345678")
        self.assertEqual(format_phone_number("00254712345678"), "254712345678")
        self.assertEqual(format_phone_number("712345678"), "254712345678")
        self.assertEqual(format_phone_number("112345678"), "254112345678")
