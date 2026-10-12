from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsStaffOrAdminUser
from .emails import send_order_confirmed_email
from .models import Order


class AdminOrdersView(APIView):
    """All orders for the admin workspace and sheet, newest first.

    Filters: ?status=<pipeline status or "pending">, ?search=<order number,
    shipping name, or email>. "pending" means not delivered/cancelled.
    Supports ?page= and ?page_size= (default 20, max 100).
    """

    permission_classes = [IsStaffOrAdminUser]

    def get(self, request):
        all_orders = Order.objects.all()
        qs = all_orders.select_related("user").prefetch_related("items").order_by("-created_at")

        status_param = (request.query_params.get("status") or "").strip()
        if status_param == "pending":
            qs = qs.exclude(
                status__in=[Order.Status.DELIVERED, Order.Status.CANCELLED]
            )
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
            order.save()

        if status_changed and new_status == Order.Status.CONFIRMED:
            # Admin/staff sign-off - this is when the customer gets the
            # "order confirmed" email (M-Pesa orders were only PAID +
            # PROCESSING until this point).
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
