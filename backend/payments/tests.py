from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status

from orders.models import Order
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

        tx = PaymentTransaction.objects.get(checkout_request_id=response.data["checkout_request_id"])
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
        url = reverse("payment-status", kwargs={"checkout_request_id": tx.checkout_request_id})
        response = self.client.get(url, {"payment_token": self.token})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "PENDING")

    def test_payment_status_polling_requires_ownership(self):
        tx = self._make_tx("ws_CO_noperm")
        url = reverse("payment-status", kwargs={"checkout_request_id": tx.checkout_request_id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        response = self.client.get(url, {"payment_token": "bogus"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

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
            return_value={"ResultCode": 1032, "ResultDesc": "Request cancelled by user"},
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
