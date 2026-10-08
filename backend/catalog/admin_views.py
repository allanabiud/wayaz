from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Q, F, Sum, Count
from django.db.models.functions import TruncWeek
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from accounts.permissions import IsStaffOrAdminUser
from orders.models import Order, OrderItem
from .models import Category, Product, ProductImage
from .serializers import CategorySerializer
from .admin_serializers import (
    AdminProductImageSerializer,
    AdminProductSerializer,
)

User = get_user_model()


class AdminOverviewView(APIView):
    permission_classes = [IsStaffOrAdminUser]

    def get(self, request):
        total_products = Product.objects.count()
        total_stock = (
            Product.objects.aggregate(total=Sum("stock_quantity"))["total"] or 0
        )

        out_of_stock_count = Product.objects.filter(stock_quantity=0).count()
        low_stock_products = list(
            Product.objects.filter(stock_quantity__gt=0, stock_quantity__lte=5)
            .select_related("category")
            .order_by("stock_quantity")[:10]
        )

        total_categories = Category.objects.count()
        total_customers = User.objects.filter(role="customer").count()

        # Monthly deltas for the dashboard KPI cards
        month_start = timezone.now().replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        products_added_this_month = Product.objects.filter(
            created_at__gte=month_start
        ).count()
        new_customers_this_month = User.objects.filter(
            role="customer", date_joined__gte=month_start
        ).count()

        # Top products by sales, excluding cancelled orders (group-by
        # aggregate, no join fan-out).
        sales_rows = list(
            OrderItem.objects.filter(product__isnull=False)
            .exclude(order__status=Order.Status.CANCELLED)
            .values("product_id")
            .annotate(
                units_sold=Sum("quantity"),
                revenue=Sum(F("unit_price") * F("quantity")),
            )
            .order_by("-revenue", "-units_sold")[:5]
        )
        sales_products = Product.objects.in_bulk(
            [row["product_id"] for row in sales_rows]
        )
        top_products = [
            {
                "id": row["product_id"],
                "title": sales_products[row["product_id"]].title,
                "units_sold": row["units_sold"],
                "revenue": float(row["revenue"] or 0),
            }
            for row in sales_rows
            if row["product_id"] in sales_products
        ]

        # All-time units sold (excluding cancelled) for the Top Products header.
        sales_summary = {
            "units_sold": (
                OrderItem.objects.exclude(order__status=Order.Status.CANCELLED).aggregate(
                    units=Sum("quantity")
                )["units"]
                or 0
            ),
        }

        # Revenue series: last 30 days, confirmed money only.
        confirmed_statuses = [
            Order.Status.PAID,
            Order.Status.PROCESSING,
            Order.Status.SHIPPED,
            Order.Status.DELIVERED,
        ]
        series_start = timezone.localdate() - timedelta(days=29)
        daily_revenue = {
            row["created_at__date"]: row
            for row in Order.objects.filter(
                status__in=confirmed_statuses,
                created_at__date__gte=series_start,
            )
            .values("created_at__date")
            .annotate(revenue=Sum("total_amount"), orders=Count("id"))
        }
        revenue_series = []
        for offset in range(30):
            day = series_start + timedelta(days=offset)
            row = daily_revenue.get(day)
            revenue_series.append(
                {
                    "date": day.isoformat(),
                    "revenue": float(row["revenue"]) if row and row["revenue"] else 0,
                    "orders": row["orders"] if row else 0,
                }
            )

        confirmed = Order.objects.filter(status__in=confirmed_statuses)
        revenue_summary = {
            "total": float(confirmed.aggregate(total=Sum("total_amount"))["total"] or 0),
            "this_month": float(
                confirmed.filter(created_at__gte=month_start).aggregate(
                    total=Sum("total_amount")
                )["total"]
                or 0
            ),
            "orders_total": Order.objects.count(),
            "orders_this_month": Order.objects.filter(created_at__gte=month_start).count(),
            "pending_orders": Order.objects.filter(
                status=Order.Status.PENDING_PAYMENT
            ).count(),
        }
        # Previous 30-day window for the delta shown under Total Revenue.
        revenue_summary["prev_30d"] = float(
            Order.objects.filter(
                status__in=confirmed_statuses,
                created_at__date__gte=series_start - timedelta(days=30),
                created_at__date__lt=series_start,
            ).aggregate(total=Sum("total_amount"))["total"]
            or 0
        )

        # Weekly order counts (Monday-start buckets) for the dashboard bar chart.
        weeks_count = 8
        today = timezone.localdate()
        this_week_start = today - timedelta(days=today.weekday())
        orders_week_start = this_week_start - timedelta(weeks=weeks_count - 1)
        weekly_rows = (
            Order.objects.filter(created_at__date__gte=orders_week_start)
            .annotate(week=TruncWeek("created_at", tzinfo=timezone.get_current_timezone()))
            .values("week")
            .annotate(n=Count("id"))
        )
        weekly_counts = {}
        for row in weekly_rows:
            week_value = row["week"]
            week_key = week_value.date() if hasattr(week_value, "date") else week_value
            weekly_counts[week_key] = row["n"]
        orders_series = [
            {
                "week_start": (orders_week_start + timedelta(weeks=i)).isoformat(),
                "orders": weekly_counts.get(orders_week_start + timedelta(weeks=i), 0),
            }
            for i in range(weeks_count)
        ]

        # Stock share per category (for the dashboard donut chart)
        stock_by_category = [
            {
                "name": row["category__name"] or "Uncategorized",
                "units": row["units"] or 0,
                "products": row["products"],
            }
            for row in (
                Product.objects.values("category__name")
                .annotate(
                    units=Sum("stock_quantity"),
                    products=Count("id"),
                )
                .order_by("-units")
            )
        ]

        # Newest products + newest customers merged into a feed
        activity = [
            {
                "type": "product",
                "title": p.title,
                "detail": "Product added to catalog",
                "at": p.created_at,
            }
            for p in Product.objects.order_by("-created_at")[:6]
        ]
        activity += [
            {
                "type": "customer",
                "title": u.display_name or u.username,
                "detail": "New customer registered",
                "at": u.date_joined,
            }
            for u in User.objects.filter(role="customer").order_by("-date_joined")[:6]
        ]
        activity.sort(key=lambda item: item["at"], reverse=True)

        return Response(
            {
                "kpis": {
                    "total_products": total_products,
                    "total_stock_units": total_stock,
                    "out_of_stock_count": out_of_stock_count,
                    "total_categories": total_categories,
                    "total_customers": total_customers,
                    "products_added_this_month": products_added_this_month,
                    "new_customers_this_month": new_customers_this_month,
                },
                "top_products": top_products,
                "sales_summary": sales_summary,
                "revenue_series": revenue_series,
                "revenue_summary": revenue_summary,
                "orders_series": orders_series,
                "stock_by_category": stock_by_category,
                "recent_activity": activity[:8],
                "low_stock_alerts": [
                    {
                        "product_id": p.id,
                        "product_title": p.title,
                        "image_url": (
                            p.primary_image.image.url
                            if p.primary_image and p.primary_image.image
                            else None
                        ),
                        "stock_quantity": p.stock_quantity,
                    }
                    for p in low_stock_products
                ],
            }
        )


class AdminNavCountsView(APIView):
    """Lightweight counts for the admin sidebar (Management section)."""

    permission_classes = [IsStaffOrAdminUser]

    def get(self, request):
        return Response(
            {
                "orders": Order.objects.count(),
                "products": Product.objects.count(),
                "customers": User.objects.filter(role="customer").count(),
            }
        )


class AdminOrdersView(APIView):
    """All orders for the admin header sheet, newest first.

    Filters: ?status=<pipeline status or "pending">, ?search=<order number,
    shipping name, or email>. "pending" means not delivered/cancelled.
    `count` honours the filters; `pending_count` never does (header badge).
    """

    permission_classes = [IsStaffOrAdminUser]

    def get(self, request):
        all_orders = Order.objects.all()
        qs = all_orders.select_related("user").order_by("-created_at")

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
            )

        results = [
            {
                "order_number": o.order_number,
                "customer": o.shipping_name or o.email,
                "status": o.status,
                "status_display": o.get_status_display(),
                "payment_method_display": o.get_payment_method_display(),
                "total_amount": str(o.total_amount),
                "item_count": o.item_count,
                "created_at": o.created_at.isoformat(),
            }
            for o in qs[:20]
        ]
        return Response(
            {
                "count": qs.count(),
                "pending_count": all_orders.exclude(
                    status__in=[Order.Status.DELIVERED, Order.Status.CANCELLED]
                ).count(),
                "results": results,
            }
        )


class AdminProductViewSet(viewsets.ModelViewSet):
    queryset = (
        Product.objects.select_related("category")
        .prefetch_related("images")
        .all()
    )
    serializer_class = AdminProductSerializer
    permission_classes = [IsStaffOrAdminUser]
    lookup_field = "id"

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params

        search = params.get("search")
        if search:
            qs = qs.filter(
                Q(title__icontains=search)
                | Q(category__name__icontains=search)
                | Q(description__icontains=search)
            ).distinct()

        category = params.get("category")
        if category:
            qs = qs.filter(category_id=category)

        in_stock = params.get("in_stock")
        if in_stock in ("true", "1"):
            qs = qs.filter(stock_quantity__gt=0)
        elif in_stock in ("false", "0"):
            qs = qs.filter(stock_quantity=0)

        return qs


class AdminCategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsStaffOrAdminUser]
    lookup_field = "id"


class AdminProductStockView(APIView):
    permission_classes = [IsStaffOrAdminUser]

    def post(self, request, product_id):
        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return Response(
                {"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND
            )

        new_stock = request.data.get("stock_quantity")
        adjustment = request.data.get("adjustment")

        if new_stock is not None:
            try:
                product.stock_quantity = max(0, int(new_stock))
            except ValueError:
                return Response(
                    {"detail": "Invalid stock quantity."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        elif adjustment is not None:
            try:
                product.stock_quantity = max(0, product.stock_quantity + int(adjustment))
            except ValueError:
                return Response(
                    {"detail": "Invalid adjustment number."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            return Response(
                {"detail": "Provide either 'stock_quantity' or 'adjustment'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        product.save()
        return Response(AdminProductSerializer(product).data)


class AdminProductImageUploadView(APIView):
    permission_classes = [IsStaffOrAdminUser]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, product_id):
        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return Response(
                {"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND
            )

        image_file = request.FILES.get("image")
        if not image_file:
            return Response(
                {"detail": "No image file provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        is_primary = request.data.get("is_primary", "false").lower() in ("true", "1")
        alt_text = request.data.get("alt_text", product.title)
        display_order = int(request.data.get("display_order", 0))

        image = ProductImage.objects.create(
            product=product,
            image=image_file,
            alt_text=alt_text,
            is_primary=is_primary,
            display_order=display_order,
        )

        return Response(
            {
                "id": image.id,
                "url": request.build_absolute_uri(image.image.url),
                "is_primary": image.is_primary,
                "display_order": image.display_order,
            },
            status=status.HTTP_201_CREATED,
        )


class AdminProductImageDetailView(APIView):
    permission_classes = [IsStaffOrAdminUser]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def _get_image(self, product_id, image_id):
        return ProductImage.objects.filter(
            id=image_id, product_id=product_id
        ).first()

    def patch(self, request, product_id, image_id):
        image = self._get_image(product_id, image_id)
        if image is None:
            return Response(
                {"detail": "Image not found."}, status=status.HTTP_404_NOT_FOUND
            )

        if "is_primary" in request.data:
            raw = request.data["is_primary"]
            image.is_primary = (
                raw if isinstance(raw, bool) else str(raw).lower() in ("true", "1")
            )
        if "alt_text" in request.data:
            image.alt_text = str(request.data["alt_text"])
        if "display_order" in request.data:
            try:
                image.display_order = int(request.data["display_order"])
            except (TypeError, ValueError):
                return Response(
                    {"detail": "Invalid display_order."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        image.save()
        return Response(AdminProductImageSerializer(image).data)

    def delete(self, request, product_id, image_id):
        image = self._get_image(product_id, image_id)
        if image is None:
            return Response(
                {"detail": "Image not found."}, status=status.HTTP_404_NOT_FOUND
            )

        was_primary = image.is_primary
        image.delete()

        if was_primary:
            next_image = (
                ProductImage.objects.filter(product_id=product_id)
                .order_by("display_order", "id")
                .first()
            )
            if next_image:
                next_image.is_primary = True
                next_image.save()

        return Response(status=status.HTTP_204_NO_CONTENT)
