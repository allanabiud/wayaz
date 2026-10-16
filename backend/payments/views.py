import logging
import secrets
import uuid
from decimal import Decimal

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiTypes,
    extend_schema,
    inline_serializer,
)
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from orders.emails import send_new_order_email_merchant, send_payment_received_email
from orders.models import CartItem, Order
from orders.tokens import request_owns_order

from .daraja import format_phone_number, initiate_stk_push, stk_query
from .models import PaymentTransaction

logger = logging.getLogger(__name__)


def _amounts_match(callback_value, expected: Decimal) -> bool:
    """True when the amount Safaricom reports equals what we asked for."""
    try:
        return Decimal(str(callback_value)).quantize(
            Decimal("0.01")
        ) == expected.quantize(Decimal("0.01"))
    except Exception:
        return False


def complete_paid_order(order):
    """Verification-time reveal: mark the order paid, surface a held M-Pesa
    order as a real one, drop the cart lines it bought, and tell the shopper
    and the merchant. Shared by the Daraja callback and the mock simulator."""
    with transaction.atomic():
        order.payment_status = Order.PaymentStatus.PAID
        if order.status == Order.Status.AWAITING_PAYMENT:
            order.status = Order.Status.PROCESSING
        order.save()
        if order.checkout_cart_item_ids:
            CartItem.objects.filter(id__in=order.checkout_cart_item_ids).delete()
    try:
        send_payment_received_email(order)
    except Exception:
        logger.exception("Payment-received email failed for %s", order.order_number)
    try:
        send_new_order_email_merchant(order)
    except Exception:
        logger.exception("Merchant order email failed for %s", order.order_number)


def release_failed_hold(transaction):
    """A failed or cancelled M-Pesa attempt hands its reserved stock back
    immediately instead of waiting for the cron sweep, and drops the unpaid
    hold outright (it was never a real order) so the shopper can check out
    again at once. Paid orders are left alone, and so is an order whose
    earlier attempt is still awaiting a PIN prompt."""
    order = transaction.order
    if order.payment_status != Order.PaymentStatus.PENDING:
        return
    if order.payment_method != Order.PaymentMethod.M_PESA:
        return
    if order.status not in (
        Order.Status.AWAITING_PAYMENT,
        Order.Status.PROCESSING,
    ):
        return
    # A retry may still be live: only the last unresolved attempt may release.
    other_attempt_pending = PaymentTransaction.objects.filter(
        order=order, status=PaymentTransaction.Status.PENDING
    ).exclude(pk=transaction.pk)
    if other_attempt_pending.exists():
        return

    hold = order.status == Order.Status.AWAITING_PAYMENT
    order.cancel()  # atomic: status flip + stock restoration
    if hold:
        # Cascades its payment transactions, same as the cron sweep.
        order.delete()


# Status polling runs every couple of seconds; ask Daraja at most this often
# per transaction so a long PIN prompt cannot hammer the API.
RECONCILE_COOLDOWN_SECONDS = 10


def reconcile_transaction(payment, *, force: bool = False) -> bool:
    """Resolve an unresolved STK attempt by asking Safaricom directly.

    The Daraja callback is best-effort - a server-to-server POST to a public
    URL that some networks never deliver - so nothing that matters may depend
    on it. Status polling, the checkout hold guard and the stale-order sweep
    all call this to learn the real outcome instead of leaving the
    transaction PENDING forever.

    Returns True when the transaction is in a terminal state afterwards
    (already resolved, or resolved here); False when it is still unresolved:
    still processing at Safaricom, Daraja could not answer, mock mode (the
    fake stk_query would "succeed" any request; the simulate endpoint drives
    mock results), or the cooldown suppressed the query.
    """
    if payment.status != PaymentTransaction.Status.PENDING:
        return True
    if settings.MPESA_ENVIRONMENT == "mock":
        return False
    if not force:
        if cache.get(f"mpesa_reconcile_{payment.pk}"):
            return False
        cache.set(f"mpesa_reconcile_{payment.pk}", 1, RECONCILE_COOLDOWN_SECONDS)

    query = stk_query(payment.checkout_request_id)
    if query is None:
        # Still processing, or Daraja could not answer: not terminal yet.
        return False
    result_code = str(query.get("ResultCode", ""))
    result_desc = str(query.get("ResultDesc", ""))
    succeeded = result_code == "0"

    with transaction.atomic():
        try:
            locked = PaymentTransaction.objects.select_for_update().get(pk=payment.pk)
        except PaymentTransaction.DoesNotExist:
            # Released or swept away already: terminal (a failure path).
            return True
        if locked.status != PaymentTransaction.Status.PENDING:
            # A concurrent callback (or poll) resolved it first.
            _copy_terminal_state(locked, payment)
            return True
        try:
            locked.result_code = int(result_code)
        except ValueError:
            locked.result_code = None
        locked.result_desc = result_desc or locked.result_desc
        # stkpushquery carries no receipt number; a late callback backfills it.
        locked.status = (
            PaymentTransaction.Status.COMPLETED
            if succeeded
            else PaymentTransaction.Status.FAILED
        )
        locked.save()
        _copy_terminal_state(locked, payment)
        order = locked.order

    if succeeded:
        # Reveal a held order exactly like the callback would.
        complete_paid_order(order)
    else:
        # Cancelled/failed/expired: hand the reserved stock straight back.
        release_failed_hold(locked)
    return True


def _copy_terminal_state(source, target) -> None:
    """Mirror resolved fields onto the caller's (possibly stale) instance."""
    target.status = source.status
    target.result_code = source.result_code
    target.result_desc = source.result_desc
    target.mpesa_receipt_number = source.mpesa_receipt_number


class STKPushInitiateView(APIView):
    """POST /api/v1/payments/mpesa/stk-push/ - initiates an STK Push for an
    order. Ownership is enforced (authenticated shopper or checkout
    payment_token), else anyone knowing an order number could prompt its phone."""

    permission_classes = [permissions.AllowAny]
    throttle_scope = "payments"

    @extend_schema(
        summary="Initiate M-Pesa STK Push",
        request=inline_serializer(
            name="STKPushInitiateRequest",
            fields={
                "order_number": serializers.CharField(required=True),
                "phone_number": serializers.CharField(required=True),
                "payment_token": serializers.CharField(required=False),
            },
        ),
        responses={
            200: inline_serializer(
                name="STKPushInitiateResponse",
                fields={
                    "detail": serializers.CharField(),
                    "checkout_request_id": serializers.CharField(),
                    "customer_message": serializers.CharField(),
                },
            )
        },
    )
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
                {
                    "detail": "Invalid Kenyan phone number format. Provide a valid Safaricom number."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            daraja_res = initiate_stk_push(order, formatted_phone)
            checkout_request_id = daraja_res.get("CheckoutRequestID")
            merchant_request_id = daraja_res.get("MerchantRequestID")

            PaymentTransaction.objects.create(
                order=order,
                merchant_request_id=merchant_request_id,
                checkout_request_id=checkout_request_id,
                amount=order.total_amount,
                phone_number=formatted_phone,
                status=PaymentTransaction.Status.PENDING,
            )

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
    """GET payment status polling endpoint; same ownership rule as STK push
    (authenticated owner or payment_token)."""

    permission_classes = [permissions.AllowAny]
    throttle_scope = "payments"

    @extend_schema(
        summary="Check status of M-Pesa transaction",
        parameters=[
            OpenApiParameter(
                "payment_token",
                OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                description="Capability token issued at checkout",
                required=False,
            )
        ],
        responses={
            200: inline_serializer(
                name="STKPushStatusResponse",
                fields={
                    "checkout_request_id": serializers.CharField(),
                    "order_number": serializers.CharField(),
                    "status": serializers.CharField(),
                    "payment_status": serializers.CharField(),
                    "mpesa_receipt_number": serializers.CharField(allow_null=True),
                    "result_desc": serializers.CharField(allow_null=True),
                },
            )
        },
    )
    def get(self, request, checkout_request_id):
        payment = get_object_or_404(
            PaymentTransaction.objects.select_related("order"),
            checkout_request_id=checkout_request_id,
        )

        if not request_owns_order(request, payment.order):
            return Response(
                {"detail": "You are not authorised to view this payment."},
                status=status.HTTP_403_FORBIDDEN,
            )

        order_number = payment.order.order_number
        if (
            payment.status == PaymentTransaction.Status.PENDING
            and reconcile_transaction(payment)
        ):
            # Resolved while we watched - reload the outcome; the failed path
            # releases the hold outright, which cascades the transaction away.
            try:
                payment = PaymentTransaction.objects.select_related("order").get(
                    pk=payment.pk
                )
            except PaymentTransaction.DoesNotExist:
                return Response(
                    {
                        "checkout_request_id": checkout_request_id,
                        "order_number": order_number,
                        "status": PaymentTransaction.Status.FAILED,
                        "payment_status": Order.PaymentStatus.FAILED,
                        "mpesa_receipt_number": None,
                        "result_desc": payment.result_desc
                        or "M-Pesa payment failed or was cancelled.",
                    }
                )

        return Response(
            {
                "checkout_request_id": payment.checkout_request_id,
                "order_number": payment.order.order_number,
                "status": payment.status,
                "payment_status": payment.order.payment_status,
                "mpesa_receipt_number": payment.mpesa_receipt_number,
                "result_desc": payment.result_desc,
            }
        )


class STKPushMockSimulateView(APIView):
    """Simulate an instant STK callback in mock mode only; returns 404
    elsewhere so nobody can mint a "paid" order without paying."""

    permission_classes = [permissions.AllowAny]

    @extend_schema(
        summary="Simulate M-Pesa STK callback (Mock mode only)",
        request=inline_serializer(
            name="MockSimulateRequest",
            fields={
                "checkout_request_id": serializers.CharField(),
                "action": serializers.ChoiceField(choices=["success", "fail"]),
            },
        ),
        responses={
            200: inline_serializer(
                name="MockSimulateResponse",
                fields={
                    "detail": serializers.CharField(),
                    "status": serializers.CharField(),
                },
            )
        },
    )
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

            # Same reveal path as the real callback.
            complete_paid_order(transaction.order)

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
            # Same release path as the real failure callback.
            release_failed_hold(transaction)

            return Response(
                {
                    "detail": "Simulated failed/cancelled M-Pesa payment.",
                    "status": "FAILED",
                }
            )


class DarajaCallbackView(APIView):
    """Safaricom webhook (POST /api/v1/payments/mpesa/callback/<token>/).
    Anti-spoofing: constant-time shared-secret URL, success re-verified via
    stkpushquery, Amount must match; 503 on transient failures to redeliver."""

    permission_classes = [permissions.AllowAny]

    @extend_schema(
        summary="Daraja STK push webhook callback (server-to-server only)",
        description=(
            "Safaricom-only webhook, called asynchronously after the customer "
            "enters their PIN. Never invoke it from the client: it must arrive "
            "from Safaricom's servers with the shared secret embedded in the "
            "URL path. A missing or wrong token is rejected (403), and a "
            "reported success is re-verified against Daraja's stkpushquery "
            "before the order is marked paid."
        ),
        request=inline_serializer(
            name="DarajaCallbackRequest",
            fields={
                "Body": inline_serializer(
                    name="DarajaCallbackBody",
                    fields={
                        "stkCallback": inline_serializer(
                            name="DarajaStkCallback",
                            fields={
                                "MerchantRequestID": serializers.CharField(),
                                "CheckoutRequestID": serializers.CharField(),
                                "ResultCode": serializers.IntegerField(),
                                "ResultDesc": serializers.CharField(),
                                "CallbackMetadata": inline_serializer(
                                    name="DarajaCallbackMetadata",
                                    fields={
                                        "Item": serializers.ListField(
                                            child=inline_serializer(
                                                name="DarajaCallbackMetadataItem",
                                                fields={
                                                    "Name": serializers.CharField(
                                                        help_text="Amount | MpesaReceiptNumber | TransactionDate | PhoneNumber."
                                                    ),
                                                    "Value": serializers.JSONField(
                                                        help_text="Type depends on Name."
                                                    ),
                                                },
                                            )
                                        ),
                                    },
                                    required=False,
                                    help_text="Present on success only.",
                                ),
                            },
                        ),
                    },
                ),
            },
        ),
        responses={
            200: inline_serializer(
                name="DarajaCallbackResponse",
                fields={
                    "ResultCode": serializers.IntegerField(),
                    "ResultDesc": serializers.CharField(),
                },
            )
        },
    )
    def post(self, request, token=None):
        secret = settings.MPESA_CALLBACK_SECRET
        if not secret:
            # Without a shared secret anyone could forge a "paid" callback.
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

            if transaction.status == PaymentTransaction.Status.COMPLETED:
                # Late or duplicate delivery: status polling (or the sweep)
                # may already have reconciled this attempt against Daraja.
                # Backfill a receipt we are missing and ack - re-running the
                # reveal path would email the shopper and merchant twice.
                if result_code == 0 and not transaction.mpesa_receipt_number:
                    items = stk_callback.get("CallbackMetadata", {}).get("Item", [])
                    for item in items:
                        if item.get("Name") == "MpesaReceiptNumber":
                            transaction.mpesa_receipt_number = item.get("Value")
                            transaction.save(update_fields=["mpesa_receipt_number"])
                            break
                return Response({"ResultCode": 0, "ResultDesc": "Success"})

            if (
                transaction.status == PaymentTransaction.Status.FAILED
                and result_code != 0
            ):
                # Duplicate failure delivery: already failed and released.
                return Response({"ResultCode": 0, "ResultDesc": "Success"})

            transaction.result_code = result_code
            transaction.result_desc = result_desc
            transaction.raw_callback_payload = payload

            if result_code == 0:
                items = stk_callback.get("CallbackMetadata", {}).get("Item", [])
                receipt_number = None
                callback_amount = None
                for item in items:
                    name = item.get("Name")
                    if name == "MpesaReceiptNumber":
                        receipt_number = item.get("Value")
                    elif name == "Amount":
                        callback_amount = item.get("Value")

                # Amount mismatch: not our transaction or a forged callback.
                # Flag for manual verification, don't mark paid.
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

                # Re-verify with Safaricom: the callback POST alone is not proof.
                query = stk_query(checkout_request_id)
                if query is None:
                    # Couldn't verify; 5xx makes Safaricom redeliver the webhook.
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

                # Reveal a held order; it stays PROCESSING until staff
                # confirm it from the dashboard.
                complete_paid_order(transaction.order)

            else:
                # Cancelled or failed PIN entry: give the reserved stock back
                # right away rather than leaving it held until the sweep.
                transaction.status = PaymentTransaction.Status.FAILED
                transaction.save()
                release_failed_hold(transaction)

            return Response({"ResultCode": 0, "ResultDesc": "Success"})

        except Exception:
            logger.exception("Error processing Daraja webhook")
            return Response({"ResultCode": 0, "ResultDesc": "Error Handled"})
