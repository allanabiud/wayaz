from django.db.models import Count, Q
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiTypes,
    extend_schema,
    inline_serializer,
)
from rest_framework import serializers, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsStaffOrAdminUser
from catalog.admin_serializers import AdminErrorDetailSerializer

from .admin_serializers import (
    AdminCouponSerializer,
    AdminOrderDetailResponseSerializer,
    AdminOrderListResponseSerializer,
    AdminPaymentsResponseSerializer,
)
from .emails import send_order_confirmed_email
from .models import Coupon, Order


class AdminOrdersView(APIView):
    """All admin orders, newest first. `status` takes a pipeline status or
    "pending" (not delivered/cancelled); supports page/page_size."""

    permission_classes = [IsStaffOrAdminUser]

    @extend_schema(
        summary="List orders (admin)",
        parameters=[
            OpenApiParameter(
                "status",
                OpenApiTypes.STR,
                description='Pipeline status, or "pending" for anything not delivered/cancelled.',
            ),
            OpenApiParameter(
                "search",
                OpenApiTypes.STR,
                description="Order number, shipping name or email.",
            ),
            OpenApiParameter("page", OpenApiTypes.INT, description="1-based page."),
            OpenApiParameter(
                "page_size", OpenApiTypes.INT, description="Default 20, max 100."
            ),
        ],
        responses={200: AdminOrderListResponseSerializer},
    )
    def get(self, request):
        all_orders = Order.objects.all()
        qs = (
            all_orders.select_related("user")
            .prefetch_related("items")
            .order_by("-created_at")
        )

        status_param = (request.query_params.get("status") or "").strip()
        if status_param == "pending":
            qs = qs.exclude(status__in=[Order.Status.DELIVERED, Order.Status.CANCELLED])
        elif status_param in Order.Status.values:
            qs = qs.filter(status=status_param)

        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(order_number__icontains=search)
                | Q(shipping_name__icontains=search)
                | Q(email__icontains=search)
                | Q(phone_number__icontains=search)
            )

        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except (ValueError, TypeError):
            page = 1

        try:
            page_size = min(100, max(1, int(request.query_params.get("page_size", 20))))
        except (ValueError, TypeError):
            page_size = 20

        total_count = qs.count()
        offset = (page - 1) * page_size
        orders_slice = qs[offset : offset + page_size]

        results = [
            {
                "id": o.id,
                "order_number": o.order_number,
                "customer": o.shipping_name or o.email,
                "email": o.email,
                "phone_number": o.phone_number,
                "county": o.county,
                "town": o.town,
                "street_address": o.street_address,
                "status": o.status,
                "status_display": o.get_status_display(),
                "payment_method": o.payment_method,
                "payment_method_display": o.get_payment_method_display(),
                "payment_status": o.payment_status,
                "total_amount": str(o.total_amount),
                "subtotal": str(o.subtotal),
                "shipping_fee": str(o.shipping_fee),
                "item_count": o.item_count,
                "items": [
                    {
                        "id": item.id,
                        "product_title": item.product_title,
                        "size": item.size,
                        "unit_price": str(item.unit_price),
                        "quantity": item.quantity,
                        "line_total": str(item.line_total),
                    }
                    for item in o.items.all()
                ],
                "created_at": o.created_at.isoformat(),
            }
            for o in orders_slice
        ]

        return Response(
            {
                "count": total_count,
                "page": page,
                "page_size": page_size,
                "pending_count": all_orders.exclude(
                    status__in=[Order.Status.DELIVERED, Order.Status.CANCELLED]
                ).count(),
                "results": results,
            }
        )


class AdminOrderDetailView(APIView):
    """View and update single order fulfillment status."""

    permission_classes = [IsStaffOrAdminUser]

    @extend_schema(
        summary="Update an order's status",
        description=(
            "Cancelling restores reserved stock; delivering a COD order "
            "auto-marks it paid; confirming triggers the confirmation email."
        ),
        request=inline_serializer(
            name="AdminOrderStatusUpdateRequest",
            fields={
                "status": serializers.CharField(required=False),
                "payment_status": serializers.CharField(required=False),
            },
        ),
        responses={
            200: AdminOrderDetailResponseSerializer,
            400: AdminErrorDetailSerializer,
            404: AdminErrorDetailSerializer,
        },
    )
    def patch(self, request, order_number):
        try:
            order = Order.objects.get(order_number=order_number)
        except Order.DoesNotExist:
            return Response(
                {"detail": "Order not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        new_status = request.data.get("status")
        if new_status and new_status not in Order.Status.values:
            return Response(
                {"detail": f"Invalid status '{new_status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        new_payment_status = request.data.get("payment_status")
        if new_payment_status and new_payment_status not in Order.PaymentStatus.values:
            return Response(
                {"detail": f"Invalid payment status '{new_payment_status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if new_payment_status:
            order.payment_status = new_payment_status

        status_changed = bool(new_status) and new_status != order.status

        if status_changed and new_status == Order.Status.CANCELLED:
            # Flips status and restores reserved stock.
            order.cancel()
            order.save()  # persist any payment_status tweak alongside it
        else:
            if status_changed:
                order.status = new_status

            # COD: cash is collected on delivery, so auto-mark as paid.
            if (
                status_changed
                and new_status == Order.Status.DELIVERED
                and order.payment_method == Order.PaymentMethod.COD
                and order.payment_status != Order.PaymentStatus.PAID
                and not new_payment_status  # don't override an explicit override
            ):
                order.payment_status = Order.PaymentStatus.PAID

            order.save()

        if status_changed and new_status == Order.Status.CONFIRMED:
            # Staff sign-off: this is when the customer gets the confirmation
            # email (M-Pesa orders sat PAID + PROCESSING until now).
            try:
                send_order_confirmed_email(order)
            except Exception:
                pass

        return Response(
            {
                "order_number": order.order_number,
                "status": order.status,
                "status_display": order.get_status_display(),
                "payment_status": order.payment_status,
            }
        )


class AdminCouponViewSet(viewsets.ModelViewSet):
    """Checkout coupons, annotated with how many orders used each. Deleting
    is safe for history: Order.coupon is SET_NULL, so past orders keep
    their discount_amount."""

    # Explicit order_by: annotate() switches to GROUP BY mode where
    # Meta.ordering no longer applies.
    queryset = (
        Coupon.objects.annotate(order_count=Count("orders"))
        .order_by("-created_at")
        .all()
    )
    serializer_class = AdminCouponSerializer
    permission_classes = [IsStaffOrAdminUser]
    lookup_field = "id"


class AdminPaymentsView(APIView):
    """Merged M-Pesa transactions and COD orders, newest first; `method`,
    `status`, `page`, `page_size` filter and paginate (see schema)."""

    permission_classes = [IsStaffOrAdminUser]

    @extend_schema(
        summary="List payments (admin)",
        description="Merged M-Pesa transactions and COD orders, newest first.",
        parameters=[
            OpenApiParameter(
                "method",
                OpenApiTypes.STR,
                description='"mpesa" or "cod" (default: both).',
            ),
            OpenApiParameter(
                "status",
                OpenApiTypes.STR,
                description="M-Pesa transaction status, or PENDING/PAID for COD.",
            ),
            OpenApiParameter("page", OpenApiTypes.INT, description="1-based page."),
            OpenApiParameter(
                "page_size", OpenApiTypes.INT, description="Default 10, max 100."
            ),
        ],
        responses={200: AdminPaymentsResponseSerializer},
    )
    def get(self, request):
        from payments.models import PaymentTransaction

        method = (request.query_params.get("method") or "").lower()
        status_filter = (request.query_params.get("status") or "").upper()
        page = max(1, int(request.query_params.get("page", 1)))
        try:
            page_size = min(100, max(1, int(request.query_params.get("page_size", 10))))
        except (TypeError, ValueError):
            page_size = 10
        offset = (page - 1) * page_size

        payments = []

        if not method or method == "mpesa":
            mpesa_qs = PaymentTransaction.objects.select_related("order").order_by(
                "-created_at"
            )
            if status_filter:
                mpesa_qs = mpesa_qs.filter(status=status_filter)
            for tx in mpesa_qs:
                payments.append(
                    {
                        "type": "mpesa",
                        "id": f"mpesa-{tx.id}",
                        "order_number": tx.order.order_number,
                        "amount": str(tx.amount),
                        "phone": tx.phone_number,
                        "status": tx.status,
                        "reference": tx.mpesa_receipt_number or "",
                        "note": tx.result_desc or "",
                        "date": tx.created_at.isoformat(),
                    }
                )

        # COD status reflects payment collection, not fulfillment.
        if not method or method == "cod":
            cod_qs = Order.objects.filter(
                payment_method=Order.PaymentMethod.COD
            ).order_by("-created_at")
            if status_filter in ("PAID", "PENDING"):
                cod_qs = cod_qs.filter(payment_status=status_filter)
            for order in cod_qs:
                payments.append(
                    {
                        "type": "cod",
                        "id": f"cod-{order.id}",
                        "order_number": order.order_number,
                        "amount": str(order.total_amount),
                        "phone": order.phone_number,
                        "status": "COMPLETED"
                        if order.payment_status == Order.PaymentStatus.PAID
                        else "PENDING",
                        "reference": "",
                        "note": order.get_status_display(),
                        "date": order.created_at.isoformat(),
                    }
                )

        payments.sort(key=lambda p: p["date"], reverse=True)
        total = len(payments)
        page_items = payments[offset : offset + page_size]

        return Response(
            {
                "count": total,
                "page": page,
                "page_size": page_size,
                "total_pages": max(1, (total + page_size - 1) // page_size),
                "results": page_items,
            }
        )
