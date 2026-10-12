import logging
import uuid
from decimal import Decimal
from django.shortcuts import get_object_or_404
from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response

from orders.models import Order
from orders.emails import send_payment_received_email
from .models import PaymentTransaction
from .daraja import initiate_stk_push, format_phone_number

logger = logging.getLogger(__name__)


class STKPushInitiateView(APIView):
    """
    POST /api/v1/payments/mpesa/stk-push/
    Initiates STK Push prompt for an Order.
    Body: { "order_number": "WAYAZ-2610-1234", "phone_number": "0712345678" }
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        order_number = request.data.get("order_number")
        phone_number = request.data.get("phone_number")

        if not order_number or not phone_number:
            return Response(
                {"detail": "Both 'order_number' and 'phone_number' are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order = get_object_or_404(Order, order_number=order_number)

        if order.payment_status == Order.PaymentStatus.PAID:
            return Response(
                {"detail": "This order is already marked as paid."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        formatted_phone = format_phone_number(phone_number)
        if len(formatted_phone) < 12:
            return Response(
                {"detail": "Invalid Kenyan phone number format. Provide a valid Safaricom number."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            daraja_res = initiate_stk_push(order, formatted_phone)
            checkout_request_id = daraja_res.get("CheckoutRequestID")
            merchant_request_id = daraja_res.get("MerchantRequestID")

            transaction = PaymentTransaction.objects.create(
                order=order,
                merchant_request_id=merchant_request_id,
                checkout_request_id=checkout_request_id,
                amount=order.total_amount,
                phone_number=formatted_phone,
                status=PaymentTransaction.Status.PENDING,
            )

            # Auto-simulate mock completion if in mock mode
            is_mock = daraja_res.get("is_mock", False)

            return Response(
                {
                    "detail": "STK Push sent. Please check your phone to enter your M-Pesa PIN.",
                    "checkout_request_id": checkout_request_id,
                    "order_number": order.order_number,
                    "amount": str(order.total_amount),
                    "phone_number": formatted_phone,
                    "is_mock": is_mock,
                },
                status=status.HTTP_200_OK,
            )
        except Exception as e:
            logger.exception("Failed to initiate STK push")
            return Response(
                {"detail": f"Failed to initiate M-Pesa payment: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class STKPushStatusView(APIView):
    """
    GET /api/v1/payments/status/<checkout_request_id>/
    Frontend polling endpoint for real-time payment confirmation.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request, checkout_request_id):
        transaction = get_object_or_404(
            PaymentTransaction.objects.select_related("order"),
            checkout_request_id=checkout_request_id,
        )

        return Response(
            {
                "checkout_request_id": transaction.checkout_request_id,
                "order_number": transaction.order.order_number,
                "status": transaction.status,
                "payment_status": transaction.order.payment_status,
                "mpesa_receipt_number": transaction.mpesa_receipt_number,
                "result_desc": transaction.result_desc,
            }
        )


class STKPushMockSimulateView(APIView):
    """
    POST /api/v1/payments/mock-simulate/
    Allows test/dev environments to simulate an instant callback (Success or Failure).
    Body: { "checkout_request_id": "...", "action": "success" | "fail" }
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        checkout_request_id = request.data.get("checkout_request_id")
        action = request.data.get("action", "success")

        transaction = get_object_or_404(
            PaymentTransaction.objects.select_related("order"),
            checkout_request_id=checkout_request_id,
        )

        if action == "success":
            receipt = f"QGH{uuid.uuid4().hex[:7].upper()}"
            transaction.status = PaymentTransaction.Status.COMPLETED
            transaction.mpesa_receipt_number = receipt
            transaction.result_code = 0
            transaction.result_desc = "The service request is processed successfully."
            transaction.save()

            order = transaction.order
            order.payment_status = Order.PaymentStatus.PAID
            # Order stays PROCESSING: payment is what makes the order real,
            # admin/staff confirmation (CONFIRMED) happens from the dashboard.
            order.save()

            try:
                send_payment_received_email(order)
            except Exception:
                pass

            return Response(
                {
                    "detail": "Simulated successful M-Pesa payment.",
                    "status": "COMPLETED",
                    "mpesa_receipt_number": receipt,
                }
            )
        else:
            transaction.status = PaymentTransaction.Status.FAILED
            transaction.result_code = 1032
            transaction.result_desc = "Request cancelled by user."
            transaction.save()

            return Response(
                {
                    "detail": "Simulated failed/cancelled M-Pesa payment.",
                    "status": "FAILED",
                }
            )


class DarajaCallbackView(APIView):
    """
    POST /api/v1/payments/mpesa/callback/
    Safaricom webhook endpoint called asynchronously after user PIN entry.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        payload = request.data
        logger.info(f"[DARAJA CALLBACK RECEIVED]: {payload}")

        try:
            body = payload.get("Body", {})
            stk_callback = body.get("stkCallback", {})
            merchant_request_id = stk_callback.get("MerchantRequestID")
            checkout_request_id = stk_callback.get("CheckoutRequestID")
            result_code = stk_callback.get("ResultCode")
            result_desc = stk_callback.get("ResultDesc", "")

            transaction = PaymentTransaction.objects.filter(
                checkout_request_id=checkout_request_id
            ).first()

            if not transaction:
                logger.warning(
                    f"Callback received for unknown checkout_request_id: {checkout_request_id}"
                )
                return Response({"ResultCode": 0, "ResultDesc": "Accepted"})

            transaction.result_code = result_code
            transaction.result_desc = result_desc
            transaction.raw_callback_payload = payload

            if result_code == 0:
                # Success
                items = stk_callback.get("CallbackMetadata", {}).get("Item", [])
                receipt_number = None
                for item in items:
                    if item.get("Name") == "MpesaReceiptNumber":
                        receipt_number = item.get("Value")
                        break

                transaction.status = PaymentTransaction.Status.COMPLETED
                transaction.mpesa_receipt_number = receipt_number
                transaction.save()

                # Update Order: payment is captured, but the order itself
                # remains PROCESSING until admin/staff confirm it.
                order = transaction.order
                order.payment_status = Order.PaymentStatus.PAID
                order.save()

                try:
                    send_payment_received_email(order)
                except Exception as e:
                    logger.error(f"Failed sending payment email: {e}")

            else:
                # Cancelled or failed PIN entry
                transaction.status = PaymentTransaction.Status.FAILED
                transaction.save()

            return Response({"ResultCode": 0, "ResultDesc": "Success"})

        except Exception as e:
            logger.exception("Error processing Daraja webhook")
            return Response({"ResultCode": 0, "ResultDesc": "Error Handled"})
