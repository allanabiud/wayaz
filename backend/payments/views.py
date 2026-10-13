import logging
import secrets
import uuid
from decimal import Decimal

from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response

from orders.models import Order
from orders.emails import send_payment_received_email
from orders.tokens import request_owns_order
from .models import PaymentTransaction
from .daraja import initiate_stk_push, format_phone_number, stk_query

logger = logging.getLogger(__name__)


def _amounts_match(callback_value, expected: Decimal) -> bool:
    """True when the amount Safaricom reports equals what we asked for."""
    try:
        return Decimal(str(callback_value)).quantize(
            Decimal("0.01")
        ) == expected.quantize(Decimal("0.01"))
    except Exception:
        return False


class STKPushInitiateView(APIView):
    """
    POST /api/v1/payments/mpesa/stk-push/
    Initiates STK Push prompt for an Order.
    Body: { "order_number": "WAYAZ-2610-1234", "phone_number": "0712345678",
            "payment_token": "<issued in the checkout response>" }

    Ownership is enforced: the caller must be the authenticated shopper who
    placed the order, or hold the signed payment_token from checkout
    (guest checkout). Without this, anyone who knew an order number could
    fire M-Pesa prompts at that order's phone number.
    """
    permission_classes = [permissions.AllowAny]
    throttle_scope = "payments"

    def post(self, request):
        order_number = request.data.get("order_number")
        phone_number = request.data.get("phone_number")

        if not order_number or not phone_number:
            return Response(
                {"detail": "Both 'order_number' and 'phone_number' are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order = get_object_or_404(Order, order_number=order_number)

        if not request_owns_order(request, order):
            return Response(
                {"detail": "You are not authorised to pay for this order."},
                status=status.HTTP_403_FORBIDDEN,
            )

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
    GET /api/v1/payments/status/<checkout_request_id>/?payment_token=...
    Frontend polling endpoint for real-time payment confirmation.
    Same ownership rule as STK push: authenticated owner or payment_token.
    """
    permission_classes = [permissions.AllowAny]
    throttle_scope = "payments"

    def get(self, request, checkout_request_id):
        transaction = get_object_or_404(
            PaymentTransaction.objects.select_related("order"),
            checkout_request_id=checkout_request_id,
        )

        if not request_owns_order(request, transaction.order):
            return Response(
                {"detail": "You are not authorised to view this payment."},
                status=status.HTTP_403_FORBIDDEN,
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

    Only exists in mock mode: outside local development this returns 404,
    so nobody can mint a "paid" order without paying.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        if settings.MPESA_ENVIRONMENT != "mock":
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

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
                logger.exception(
                    "Payment-received email failed for %s", order.order_number
                )

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
    POST /api/v1/payments/mpesa/callback/<token>/
    Safaricom webhook endpoint called asynchronously after user PIN entry.

    Anti-spoofing measures:
    - the URL carries a shared secret (MPESA_CALLBACK_SECRET) that only
      Safaricom knows, checked in constant time;
    - a reported success is re-verified against Daraja's
      stkpushqueryrequestv1 - the callback POST alone is not proof;
    - the callback Amount must match the amount we asked the order to pay.

    Logs are PII-safe (no phone numbers, no payload dumps). Safaricom gets
    200 once the callback is accepted or deliberately flagged; a transient
    verification failure returns 503 so the webhook is redelivered.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request, token=None):
        secret = settings.MPESA_CALLBACK_SECRET
        if not secret:
            # Misconfiguration: without a shared secret anyone could post
            # a forged "payment succeeded" payload.
            logger.error(
                "Rejected Daraja callback: MPESA_CALLBACK_SECRET is not configured."
            )
            return Response(
                {"detail": "Callback not configured."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not token or not secrets.compare_digest(str(token), secret):
            logger.warning("Rejected Daraja callback: invalid callback token.")
            return Response(
                {"detail": "Invalid callback token."},
                status=status.HTTP_403_FORBIDDEN,
            )

        payload = request.data

        try:
            body = payload.get("Body", {})
            stk_callback = body.get("stkCallback", {})
            checkout_request_id = stk_callback.get("CheckoutRequestID")
            result_code = stk_callback.get("ResultCode")
            result_desc = stk_callback.get("ResultDesc", "")

            # Log the facts, never the payload - it carries the phone number.
            logger.info(
                f"[DARAJA CALLBACK] {checkout_request_id}: ResultCode={result_code}"
            )

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
                # Success: pull Amount + receipt out of the metadata.
                items = stk_callback.get("CallbackMetadata", {}).get("Item", [])
                receipt_number = None
                callback_amount = None
                for item in items:
                    name = item.get("Name")
                    if name == "MpesaReceiptNumber":
                        receipt_number = item.get("Value")
                    elif name == "Amount":
                        callback_amount = item.get("Value")

                # Cross-check the reported amount against what we asked
                # this order to pay - a mismatch means this callback is not
                # describing our transaction (or is forged). Flag, don't
                # mark paid: a human verifies it in the Daraja portal.
                if callback_amount is not None and not _amounts_match(
                    callback_amount, transaction.amount
                ):
                    transaction.save()  # keep audit trail (payload + result)
                    logger.critical(
                        f"[DARAJA] AMOUNT MISMATCH for {checkout_request_id}: "
                        f"callback={callback_amount} expected={transaction.amount}. "
                        f"Not marked paid - requires manual verification."
                    )
                    return Response({"ResultCode": 0, "ResultDesc": "Accepted"})

                # Re-verify with Safaricom itself: a callback can only reach
                # us through the secret URL, but this asks the source of
                # truth whether the STK request actually completed.
                query = stk_query(checkout_request_id)
                if query is None:
                    # Couldn't verify (gateway/network) - 5xx so Safaricom
                    # redelivers the webhook and we retry later.
                    return Response(
                        {
                            "ResultCode": 1,
                            "ResultDesc": "Verification pending; retry.",
                        },
                        status=status.HTTP_503_SERVICE_UNAVAILABLE,
                    )
                query_code = str(query.get("ResultCode"))
                if query_code != "0":
                    # Callback claimed success but Daraja says otherwise.
                    transaction.status = PaymentTransaction.Status.FAILED
                    transaction.result_desc = query.get(
                        "ResultDesc", transaction.result_desc
                    )
                    transaction.save()
                    logger.critical(
                        f"[DARAJA] Callback claimed success but STK query says "
                        f"ResultCode={query_code} for {checkout_request_id} - "
                        f"not marked paid (possible spoof)."
                    )
                    return Response({"ResultCode": 0, "ResultDesc": "Accepted"})

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
