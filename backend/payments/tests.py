from decimal import Decimal
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status

from orders.models import Order
from payments.models import PaymentTransaction


@override_settings(MPESA_ENVIRONMENT="mock")
class MpesaPaymentTests(TestCase):
    def setUp(self):
        self.client = APIClient()
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

    def test_stk_push_initiate_mock(self):
        url = reverse("mpesa-stk-push")
        data = {
            "order_number": self.order.order_number,
            "phone_number": "0712345678",
        }
        response = self.client.post(url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("checkout_request_id", response.data)
        self.assertTrue(response.data["is_mock"])

        # Check transaction created in DB
        tx = PaymentTransaction.objects.get(checkout_request_id=response.data["checkout_request_id"])
        self.assertEqual(tx.order, self.order)
        self.assertEqual(tx.status, PaymentTransaction.Status.PENDING)

    def test_payment_status_polling(self):
        tx = PaymentTransaction.objects.create(
            order=self.order,
            merchant_request_id="MR123",
            checkout_request_id="ws_CO_123456",
            amount=self.order.total_amount,
            phone_number="254712345678",
            status=PaymentTransaction.Status.PENDING,
        )
        url = reverse("payment-status", kwargs={"checkout_request_id": tx.checkout_request_id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "PENDING")

    def test_mock_simulate_success(self):
        tx = PaymentTransaction.objects.create(
            order=self.order,
            merchant_request_id="MR123",
            checkout_request_id="ws_CO_789012",
            amount=self.order.total_amount,
            phone_number="254712345678",
            status=PaymentTransaction.Status.PENDING,
        )
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
        # Payment makes the order real but does not confirm it - staff do
        # that from the dashboard, so it stays PROCESSING until then.
        self.assertEqual(self.order.status, Order.Status.PROCESSING)

    def test_daraja_callback_webhook(self):
        tx = PaymentTransaction.objects.create(
            order=self.order,
            merchant_request_id="MR_CALLBACK",
            checkout_request_id="ws_CO_CALLBACK_123",
            amount=self.order.total_amount,
            phone_number="254712345678",
            status=PaymentTransaction.Status.PENDING,
        )
        url = reverse("mpesa-callback")
        payload = {
            "Body": {
                "stkCallback": {
                    "MerchantRequestID": "MR_CALLBACK",
                    "CheckoutRequestID": "ws_CO_CALLBACK_123",
                    "ResultCode": 0,
                    "ResultDesc": "The service request is processed successfully.",
                    "CallbackMetadata": {
                        "Item": [
                            {"Name": "Amount", "Value": 3500.00},
                            {"Name": "MpesaReceiptNumber", "Value": "QGH8876543"},
                            {"Name": "PhoneNumber", "Value": 254712345678},
                        ]
                    },
                }
            }
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        tx.refresh_from_db()
        self.order.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.Status.COMPLETED)
        self.assertEqual(tx.mpesa_receipt_number, "QGH8876543")
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.PAID)
