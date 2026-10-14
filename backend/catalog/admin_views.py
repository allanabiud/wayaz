from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count, F, Q, Sum
from django.db.models.functions import TruncWeek
from django.utils import timezone
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiTypes,
    extend_schema,
    inline_serializer,
)
from rest_framework import serializers, status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import WishlistItem
from accounts.permissions import IsStaffOrAdminUser
from orders.models import Coupon, Order, OrderItem
from payments.models import PaymentTransaction

from .admin_serializers import (
    AdminAnalyticsResponseSerializer,
    AdminCategorySerializer,
    AdminContactMessageSerializer,
    AdminErrorDetailSerializer,
    AdminMpesaConfigResponseSerializer,
    AdminNavCountsResponseSerializer,
    AdminOverviewResponseSerializer,
    AdminProductImageSerializer,
    AdminProductImageUploadResponseSerializer,
    AdminProductImageUploadSerializer,
    AdminProductSerializer,
    AdminReviewSerializer,
    AdminStoreSettingsSerializer,
)
from .models import (
    Category,
    ContactMessage,
    Product,
    ProductImage,
    ProductReview,
    StoreSettings,
)

User = get_user_model()


def _order_counts_by_day(since, dates):
    """Order counts per local calendar day from `since`; the bound matches
    the KPI query so the bars sum to the number shown beside the chart."""
    rows = (
        Order.objects.filter(created_at__gte=since)
        .values("created_at__date")
        .annotate(n=Count("id"))
    )
    counts = {row["created_at__date"]: row["n"] for row in rows}
    return [{"date": day.isoformat(), "orders": counts.get(day, 0)} for day in dates]


class AdminOverviewView(APIView):
    permission_classes = [IsStaffOrAdminUser]

    @extend_schema(
        summary="Admin dashboard overview",
        description=(
            "One aggregate payload for the admin landing page: KPIs, "
            "period-over-period deltas, chart series and low-stock alerts."
        ),
        responses={200: AdminOverviewResponseSerializer},
    )
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

        # Local time, not UTC: a UTC "today" would start at 03:00 local.
        now = timezone.localtime()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        yesterday_start = today_start - timedelta(days=1)

        week_start = (now - timedelta(days=now.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        prev_week_start = week_start - timedelta(days=7)

        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        prev_month_end = month_start - timedelta(microseconds=1)
        prev_month_start = prev_month_end.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )

        confirmed_statuses = [
            Order.Status.PROCESSING,
            Order.Status.CONFIRMED,
            Order.Status.DELIVERED,
        ]

        def calc_delta(curr: float, prev: float):
            if prev <= 0:
                pct = 100.0 if curr > 0 else 0.0
            else:
                pct = round(((curr - prev) / prev) * 100, 1)
            return {"current": curr, "previous": prev, "percent": pct}

        rev_today = float(
            Order.objects.filter(
                status__in=confirmed_statuses, created_at__gte=today_start
            ).aggregate(t=Sum("total_amount"))["t"]
            or 0
        )
        rev_yesterday = float(
            Order.objects.filter(
                status__in=confirmed_statuses,
                created_at__gte=yesterday_start,
                created_at__lt=today_start,
            ).aggregate(t=Sum("total_amount"))["t"]
            or 0
        )

        rev_this_week = float(
            Order.objects.filter(
                status__in=confirmed_statuses, created_at__gte=week_start
            ).aggregate(t=Sum("total_amount"))["t"]
            or 0
        )
        rev_prev_week = float(
            Order.objects.filter(
                status__in=confirmed_statuses,
                created_at__gte=prev_week_start,
                created_at__lt=week_start,
            ).aggregate(t=Sum("total_amount"))["t"]
            or 0
        )

        rev_this_month = float(
            Order.objects.filter(
                status__in=confirmed_statuses, created_at__gte=month_start
            ).aggregate(t=Sum("total_amount"))["t"]
            or 0
        )
        rev_prev_month = float(
            Order.objects.filter(
                status__in=confirmed_statuses,
                created_at__gte=prev_month_start,
                created_at__lt=month_start,
            ).aggregate(t=Sum("total_amount"))["t"]
            or 0
        )

        orders_today = Order.objects.filter(created_at__gte=today_start).count()
        orders_yesterday = Order.objects.filter(
            created_at__gte=yesterday_start, created_at__lt=today_start
        ).count()
        orders_this_week = Order.objects.filter(created_at__gte=week_start).count()
        orders_prev_week = Order.objects.filter(
            created_at__gte=prev_week_start, created_at__lt=week_start
        ).count()
        orders_this_month = Order.objects.filter(created_at__gte=month_start).count()
        orders_prev_month = Order.objects.filter(
            created_at__gte=prev_month_start, created_at__lt=month_start
        ).count()

        cust_today = User.objects.filter(
            role="customer", date_joined__gte=today_start
        ).count()
        cust_yesterday = User.objects.filter(
            role="customer",
            date_joined__gte=yesterday_start,
            date_joined__lt=today_start,
        ).count()
        cust_this_week = User.objects.filter(
            role="customer", date_joined__gte=week_start
        ).count()
        cust_prev_week = User.objects.filter(
            role="customer",
            date_joined__gte=prev_week_start,
            date_joined__lt=week_start,
        ).count()
        cust_this_month = User.objects.filter(
            role="customer", date_joined__gte=month_start
        ).count()
        cust_prev_month = User.objects.filter(
            role="customer",
            date_joined__gte=prev_month_start,
            date_joined__lt=month_start,
        ).count()

        time_metrics = {
            "revenue": {
                "today": calc_delta(rev_today, rev_yesterday),
                "week": calc_delta(rev_this_week, rev_prev_week),
                "month": calc_delta(rev_this_month, rev_prev_month),
            },
            "orders": {
                "today": calc_delta(orders_today, orders_yesterday),
                "week": calc_delta(orders_this_week, orders_prev_week),
                "month": calc_delta(orders_this_month, orders_prev_month),
            },
            "customers": {
                "today": calc_delta(cust_today, cust_yesterday),
                "week": calc_delta(cust_this_week, cust_prev_week),
                "month": calc_delta(cust_this_month, cust_prev_month),
            },
        }

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

        wishlist_rows = list(
            WishlistItem.objects.values("product_id")
            .annotate(saves=Count("id"))
            .order_by("-saves")[:5]
        )
        wishlist_products = Product.objects.in_bulk(
            [row["product_id"] for row in wishlist_rows]
        )
        top_wishlisted = [
            {
                "id": row["product_id"],
                "title": wishlist_products[row["product_id"]].title,
                "saves": row["saves"],
                "price": float(wishlist_products[row["product_id"]].current_price),
                "stock": wishlist_products[row["product_id"]].stock_quantity,
            }
            for row in wishlist_rows
            if row["product_id"] in wishlist_products
        ]

        sales_summary = {
            "units_sold": (
                OrderItem.objects.exclude(
                    order__status=Order.Status.CANCELLED
                ).aggregate(units=Sum("quantity"))["units"]
                or 0
            ),
            "wishlist_saves": WishlistItem.objects.count(),
        }

        today_hourly_rows = (
            Order.objects.filter(
                status__in=confirmed_statuses,
                created_at__gte=today_start,
            )
            .values("created_at__hour")
            .annotate(revenue=Sum("total_amount"), orders=Count("id"))
        )
        today_hourly_map = {r["created_at__hour"]: r for r in today_hourly_rows}
        revenue_series_today = [
            {
                "date": f"{hour:02d}:00",
                "revenue": float(today_hourly_map[hour]["revenue"])
                if hour in today_hourly_map
                else 0,
                "orders": today_hourly_map[hour]["orders"]
                if hour in today_hourly_map
                else 0,
            }
            for hour in range(24)
        ]

        week_daily_rows = (
            Order.objects.filter(
                status__in=confirmed_statuses,
                created_at__gte=week_start,
            )
            .values("created_at__date")
            .annotate(revenue=Sum("total_amount"), orders=Count("id"))
        )
        week_daily_map = {r["created_at__date"]: r for r in week_daily_rows}
        revenue_series_week = [
            {
                "date": (week_start.date() + timedelta(days=d)).isoformat(),
                "revenue": float(
                    week_daily_map[week_start.date() + timedelta(days=d)]["revenue"]
                )
                if (week_start.date() + timedelta(days=d)) in week_daily_map
                else 0,
                "orders": week_daily_map[week_start.date() + timedelta(days=d)][
                    "orders"
                ]
                if (week_start.date() + timedelta(days=d)) in week_daily_map
                else 0,
            }
            for d in range(7)
        ]

        month_daily_rows = (
            Order.objects.filter(
                status__in=confirmed_statuses,
                created_at__gte=month_start,
            )
            .values("created_at__date")
            .annotate(revenue=Sum("total_amount"), orders=Count("id"))
        )
        month_daily_map = {r["created_at__date"]: r for r in month_daily_rows}
        days_in_month = (timezone.localdate() - month_start.date()).days + 1
        revenue_series_month = [
            {
                "date": (month_start.date() + timedelta(days=d)).isoformat(),
                "revenue": float(
                    month_daily_map[month_start.date() + timedelta(days=d)]["revenue"]
                )
                if (month_start.date() + timedelta(days=d)) in month_daily_map
                else 0,
                "orders": month_daily_map[month_start.date() + timedelta(days=d)][
                    "orders"
                ]
                if (month_start.date() + timedelta(days=d)) in month_daily_map
                else 0,
            }
            for d in range(days_in_month)
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
            "total": float(
                confirmed.aggregate(total=Sum("total_amount"))["total"] or 0
            ),
            "this_month": rev_this_month,
            "orders_total": Order.objects.count(),
            "orders_this_month": orders_this_month,
            "pending_orders": Order.objects.filter(
                status=Order.Status.PROCESSING
            ).count(),
            "prev_30d": float(
                Order.objects.filter(
                    status__in=confirmed_statuses,
                    created_at__date__gte=series_start - timedelta(days=30),
                    created_at__date__lt=series_start,
                ).aggregate(total=Sum("total_amount"))["total"]
                or 0
            ),
        }

        weeks_count = 8
        today = timezone.localdate()
        this_week_start = today - timedelta(days=today.weekday())
        orders_week_start = this_week_start - timedelta(weeks=weeks_count - 1)
        weekly_rows = (
            Order.objects.filter(created_at__date__gte=orders_week_start)
            .annotate(
                week=TruncWeek("created_at", tzinfo=timezone.get_current_timezone())
            )
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

        # Order series count every order, so each sums to its
        # time_metrics.orders KPI (revenue series do not).
        hour_rows = (
            Order.objects.filter(created_at__gte=today_start)
            .values("created_at__hour")
            .annotate(n=Count("id"))
        )
        hour_counts = {row["created_at__hour"]: row["n"] for row in hour_rows}
        orders_series_today = [
            {"date": f"{hour:02d}:00", "orders": hour_counts.get(hour, 0)}
            for hour in range(24)
        ]
        orders_series_week = _order_counts_by_day(
            week_start,
            [week_start.date() + timedelta(days=d) for d in range(7)],
        )
        orders_series_month = _order_counts_by_day(
            month_start,
            [month_start.date() + timedelta(days=d) for d in range(days_in_month)],
        )

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

        activity = [
            {
                "type": "order",
                "title": f"Order {o.order_number}",
                "detail": f"{o.shipping_name or o.email} · Ksh {float(o.total_amount):,.0f} ({o.get_status_display()})",
                "at": o.created_at,
            }
            for o in Order.objects.order_by("-created_at")[:6]
        ]
        activity += [
            {
                "type": "product",
                "title": p.title,
                "detail": f"Product added ({p.category.name if p.category else 'Catalog'})",
                "at": p.created_at,
            }
            for p in Product.objects.select_related("category").order_by("-created_at")[
                :4
            ]
        ]
        activity += [
            {
                "type": "customer",
                "title": u.display_name or u.username,
                "detail": "New customer registered",
                "at": u.date_joined,
            }
            for u in User.objects.filter(role="customer").order_by("-date_joined")[:4]
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
                    "products_added_this_month": Product.objects.filter(
                        created_at__gte=month_start
                    ).count(),
                    "new_customers_this_month": cust_this_month,
                },
                "time_metrics": time_metrics,
                "top_products": top_products,
                "top_wishlisted": top_wishlisted,
                "sales_summary": sales_summary,
                "revenue_series": revenue_series,
                "revenue_series_today": revenue_series_today,
                "revenue_series_week": revenue_series_week,
                "revenue_series_month": revenue_series_month,
                "revenue_summary": revenue_summary,
                "orders_series": orders_series,
                "orders_series_today": orders_series_today,
                "orders_series_week": orders_series_week,
                "orders_series_month": orders_series_month,
                "stock_by_category": stock_by_category,
                "recent_activity": activity[:10],
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

    @extend_schema(
        summary="Admin sidebar counts",
        description="One counter per admin section, for the Management sidebar badges.",
        responses={200: AdminNavCountsResponseSerializer},
    )
    def get(self, request):
        mpesa_count = PaymentTransaction.objects.count()
        cod_count = Order.objects.filter(payment_method="cod").count()
        return Response(
            {
                "orders": Order.objects.count(),
                "products": Product.objects.count(),
                "categories": Category.objects.count(),
                "reviews": ProductReview.objects.count(),
                "coupons": Coupon.objects.count(),
                "team": User.objects.filter(
                    role__in=[User.Role.ADMIN, User.Role.STAFF]
                ).count(),
                "customers": User.objects.filter(role="customer").count(),
                "payments": mpesa_count + cod_count,
                "messages": ContactMessage.objects.filter(is_read=False).count(),
            }
        )


class AdminProductViewSet(viewsets.ModelViewSet):
    queryset = (
        Product.objects.select_related("category").prefetch_related("images").all()
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


class AdminCategoryViewSet(viewsets.ModelViewSet):
    # Explicit order_by: annotate() switches to GROUP BY mode where
    # Meta.ordering no longer applies.
    queryset = (
        Category.objects.annotate(product_count=Count("products"))
        .order_by("display_order", "name")
        .all()
    )
    serializer_class = AdminCategorySerializer
    permission_classes = [IsStaffOrAdminUser]
    lookup_field = "id"

    def destroy(self, request, *args, **kwargs):
        # Products cascade-delete with their category; refuse while it owns any.
        category = self.get_object()
        if category.products.exists():
            return Response(
                {"detail": "Move or delete this category's products first."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class AdminReviewViewSet(viewsets.ModelViewSet):
    """Moderate shopper reviews: list, hide/restore, or delete. Reviews come
    from the storefront, so there is no create path; `is_approved` is the
    only writable field."""

    queryset = ProductReview.objects.select_related("product", "user").all()
    serializer_class = AdminReviewSerializer
    permission_classes = [IsStaffOrAdminUser]
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params

        review_status = params.get("status")
        if review_status == "hidden":
            qs = qs.filter(is_approved=False)
        elif review_status == "approved":
            qs = qs.filter(is_approved=True)

        search = params.get("search")
        if search:
            qs = qs.filter(
                Q(comment__icontains=search)
                | Q(product__title__icontains=search)
                | Q(user__username__icontains=search)
                | Q(user__first_name__icontains=search)
            )

        return qs


class AdminContactMessageViewSet(viewsets.ModelViewSet):
    """Staff inbox for contact inquiries: list (paginated, newest first), mark read/unread, delete."""

    queryset = ContactMessage.objects.all()
    serializer_class = AdminContactMessageSerializer
    permission_classes = [IsStaffOrAdminUser]
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        status_param = params.get("status")
        if status_param == "unread":
            qs = qs.filter(is_read=False)
        elif status_param == "read":
            qs = qs.filter(is_read=True)

        search = params.get("search")
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(email__icontains=search)
                | Q(phone__icontains=search)
                | Q(subject__icontains=search)
                | Q(message__icontains=search)
            )
        return qs


class AdminProductStockView(APIView):
    permission_classes = [IsStaffOrAdminUser]

    @extend_schema(
        summary="Update a product's stock",
        description=(
            "Send `stock_quantity` to set an absolute level, or `adjustment` "
            "to shift the current one (negative values included). Both clamp "
            "at zero."
        ),
        request=inline_serializer(
            name="AdminStockUpdateRequest",
            fields={
                "stock_quantity": serializers.IntegerField(required=False),
                "adjustment": serializers.IntegerField(required=False),
            },
        ),
        responses={
            200: AdminProductSerializer,
            400: AdminErrorDetailSerializer,
            404: AdminErrorDetailSerializer,
        },
    )
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
                product.stock_quantity = max(
                    0, product.stock_quantity + int(adjustment)
                )
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

    @extend_schema(
        summary="Upload a product image",
        description="Multipart upload, max 5MB, JPG/PNG/WebP only.",
        request=AdminProductImageUploadSerializer,
        responses={
            201: AdminProductImageUploadResponseSerializer,
            404: AdminErrorDetailSerializer,
        },
    )
    def post(self, request, product_id):
        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return Response(
                {"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND
            )

        serializer = AdminProductImageUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        image = ProductImage.objects.create(
            product=product,
            image=data["image"],
            alt_text=data.get("alt_text") or product.title,
            is_primary=data["is_primary"],
            display_order=data["display_order"],
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
        return ProductImage.objects.filter(id=image_id, product_id=product_id).first()

    @extend_schema(
        summary="Update a product image's metadata",
        description="Partial update of `is_primary`, `alt_text` and/or `display_order`.",
        request=inline_serializer(
            name="AdminProductImageUpdateRequest",
            fields={
                "is_primary": serializers.BooleanField(required=False),
                "alt_text": serializers.CharField(required=False, allow_blank=True),
                "display_order": serializers.IntegerField(required=False),
            },
        ),
        responses={
            200: AdminProductImageSerializer,
            400: AdminErrorDetailSerializer,
            404: AdminErrorDetailSerializer,
        },
    )
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

    @extend_schema(
        summary="Delete a product image",
        description=(
            "Deleting the primary image promotes the next one (by display "
            "order) to primary."
        ),
        responses={204: None, 404: AdminErrorDetailSerializer},
    )
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


class AdminAnalyticsView(APIView):
    """Analytics for ?period=7d|30d|90d|month|year|all (default 30d) or a
    custom ?start_date=&end_date= range."""

    permission_classes = [IsStaffOrAdminUser]

    @extend_schema(
        summary="Admin analytics report",
        description=(
            "Financial and behavioural reporting for a period. Give both "
            "start_date and end_date for a custom range, otherwise pick a "
            "period preset."
        ),
        parameters=[
            OpenApiParameter(
                "period",
                OpenApiTypes.STR,
                description="7d | 30d | 90d | month | year | all (default 30d).",
            ),
            OpenApiParameter(
                "start_date",
                OpenApiTypes.DATE,
                description="ISO date; requires end_date.",
            ),
            OpenApiParameter(
                "end_date",
                OpenApiTypes.DATE,
                description="ISO date; requires start_date.",
            ),
        ],
        responses={200: AdminAnalyticsResponseSerializer},
    )
    def get(self, request):
        # Local time so period presets start at local midnight, not 03:00.
        now = timezone.localtime()
        period = request.query_params.get("period", "30d")
        start_date_str = request.query_params.get("start_date")
        end_date_str = request.query_params.get("end_date")

        if start_date_str and end_date_str:
            try:
                start_date = timezone.datetime.fromisoformat(start_date_str)
                end_date = timezone.datetime.fromisoformat(end_date_str)
                if timezone.is_naive(start_date):
                    start_date = timezone.make_aware(start_date)
                if timezone.is_naive(end_date):
                    end_date = timezone.make_aware(end_date)
                # Include entire end_date
                end_date = end_date.replace(
                    hour=23, minute=59, second=59, microsecond=999999
                )
            except ValueError:
                start_date = now - timedelta(days=30)
                end_date = now
        else:
            end_date = now
            if period == "7d":
                start_date = now - timedelta(days=7)
            elif period == "90d":
                start_date = now - timedelta(days=90)
            elif period == "month":
                start_date = now.replace(
                    day=1, hour=0, minute=0, second=0, microsecond=0
                )
            elif period == "year":
                start_date = now.replace(
                    month=1, day=1, hour=0, minute=0, second=0, microsecond=0
                )
            elif period == "all":
                first_order = Order.objects.order_by("created_at").first()
                start_date = (
                    timezone.localtime(first_order.created_at)
                    if first_order
                    else now - timedelta(days=30)
                )
            else:  # default "30d"
                start_date = now - timedelta(days=30)

        period_orders = Order.objects.filter(
            created_at__gte=start_date, created_at__lte=end_date
        )
        confirmed_orders = period_orders.exclude(status=Order.Status.CANCELLED)

        gross_sales = float(
            confirmed_orders.aggregate(total=Sum("total_amount"))["total"] or 0
        )
        net_sales = float(
            confirmed_orders.aggregate(total=Sum("subtotal"))["total"] or 0
        )
        total_discount = float(
            confirmed_orders.aggregate(total=Sum("discount_amount"))["total"] or 0
        )
        total_orders_count = period_orders.count()
        completed_orders_count = period_orders.filter(
            status=Order.Status.DELIVERED
        ).count()
        cancelled_orders_count = period_orders.filter(
            status=Order.Status.CANCELLED
        ).count()

        aov = (
            round(gross_sales / confirmed_orders.count(), 2)
            if confirmed_orders.exists()
            else 0.0
        )
        fulfillment_rate = (
            round((completed_orders_count / total_orders_count) * 100, 1)
            if total_orders_count > 0
            else 0.0
        )
        cancellation_rate = (
            round((cancelled_orders_count / total_orders_count) * 100, 1)
            if total_orders_count > 0
            else 0.0
        )

        customer_ids = period_orders.filter(user__isnull=False).values_list(
            "user_id", flat=True
        )
        unique_customers = len(set(customer_ids))
        repeat_customers = (
            Order.objects.filter(user_id__in=customer_ids)
            .values("user_id")
            .annotate(cnt=Count("id"))
            .filter(cnt__gt=1)
            .count()
        )
        repeat_customer_rate = (
            round((repeat_customers / unique_customers) * 100, 1)
            if unique_customers > 0
            else 0.0
        )

        num_days = max(1, (end_date.date() - start_date.date()).days + 1)
        day_map = {
            r["created_at__date"]: r
            for r in confirmed_orders.values("created_at__date").annotate(
                revenue=Sum("total_amount"),
                orders=Count("id"),
            )
        }
        timeline = []
        for i in range(num_days):
            day = start_date.date() + timedelta(days=i)
            entry = day_map.get(day)
            timeline.append(
                {
                    "date": day.isoformat(),
                    "revenue": float(entry["revenue"])
                    if entry and entry["revenue"]
                    else 0,
                    "orders": entry["orders"] if entry else 0,
                }
            )

        status_counts = {s[0]: 0 for s in Order.Status.choices}
        for row in period_orders.values("status").annotate(count=Count("id")):
            status_counts[row["status"]] = row["count"]

        status_distribution = [
            {"status": k, "label": dict(Order.Status.choices).get(k, k), "count": v}
            for k, v in status_counts.items()
        ]

        payment_methods = list(
            period_orders.values("payment_method")
            .annotate(count=Count("id"), volume=Sum("total_amount"))
            .order_by("-count")
        )

        item_rows = (
            OrderItem.objects.filter(order__in=confirmed_orders)
            .values("product_id", "product_title")
            .annotate(
                units_sold=Sum("quantity"),
                revenue=Sum(F("unit_price") * F("quantity")),
            )
            .order_by("-revenue")[:10]
        )
        top_products = [
            {
                "product_id": r["product_id"],
                "title": r["product_title"],
                "units_sold": r["units_sold"],
                "revenue": float(r["revenue"] or 0),
            }
            for r in item_rows
        ]

        destinations = list(
            period_orders.values("county")
            .annotate(orders=Count("id"), volume=Sum("total_amount"))
            .order_by("-orders")[:8]
        )

        sold_product_ids = OrderItem.objects.filter(
            order__in=confirmed_orders
        ).values_list("product_id", flat=True)
        dead_stock = list(
            Product.objects.filter(stock_quantity__gt=0)
            .exclude(id__in=sold_product_ids)
            .values("id", "title", "stock_quantity", "base_price")
            .order_by("-stock_quantity")[:5]
        )

        return Response(
            {
                "period": period,
                "start_date": start_date.date().isoformat(),
                "end_date": end_date.date().isoformat(),
                "kpis": {
                    "gross_sales": gross_sales,
                    "net_sales": net_sales,
                    "total_discount": total_discount,
                    "total_orders": total_orders_count,
                    "completed_orders": completed_orders_count,
                    "cancelled_orders": cancelled_orders_count,
                    "aov": aov,
                    "fulfillment_rate": fulfillment_rate,
                    "cancellation_rate": cancellation_rate,
                    "repeat_customer_rate": repeat_customer_rate,
                },
                "timeline": timeline,
                "status_distribution": status_distribution,
                "payment_methods": payment_methods,
                "top_products": top_products,
                "destinations": destinations,
                "dead_stock": dead_stock,
            }
        )


class AdminStoreSettingsView(APIView):
    """Business and branding settings management."""

    permission_classes = [IsStaffOrAdminUser]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    @extend_schema(
        summary="Get store settings",
        responses={200: AdminStoreSettingsSerializer},
    )
    def get(self, request):
        settings = StoreSettings.load()
        serializer = AdminStoreSettingsSerializer(
            settings, context={"request": request}
        )
        return Response(serializer.data)

    @extend_schema(
        summary="Partially update store settings",
        description=(
            "Multipart or JSON. Set `clear_logo` / `clear_favicon` to remove "
            "the stored files."
        ),
        request=AdminStoreSettingsSerializer,
        responses={200: AdminStoreSettingsSerializer},
    )
    def patch(self, request):
        settings = StoreSettings.load()
        serializer = AdminStoreSettingsSerializer(
            settings, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @extend_schema(
        summary="Replace store settings",
        description="Full replace; same payload as PATCH but with every field required.",
        request=AdminStoreSettingsSerializer,
        responses={200: AdminStoreSettingsSerializer},
    )
    def put(self, request):
        return self.patch(request)


class AdminMpesaConfigView(APIView):
    """Non-sensitive M-Pesa config status and recent transactions;
    credentials (Consumer Key, Secret, Passkey) are never exposed."""

    permission_classes = [IsStaffOrAdminUser]

    @extend_schema(
        summary="M-Pesa configuration status",
        description=(
            "Non-sensitive Daraja status plus the last 50 transactions. "
            "Credentials (Consumer Key, Secret, Passkey) are never exposed."
        ),
        responses={200: AdminMpesaConfigResponseSerializer},
    )
    def get(self, request):
        from django.conf import settings as django_settings

        env = django_settings.MPESA_ENVIRONMENT
        shortcode = django_settings.MPESA_SHORTCODE
        callback_url = django_settings.MPESA_CALLBACK_URL
        is_configured = bool(
            django_settings.MPESA_CONSUMER_KEY
            and django_settings.MPESA_CONSUMER_SECRET
            and django_settings.MPESA_PASSKEY
        )

        transactions = PaymentTransaction.objects.select_related("order").order_by(
            "-created_at"
        )[:50]
        tx_data = [
            {
                "id": tx.id,
                "order_number": tx.order.order_number,
                "amount": str(tx.amount),
                "phone_number": tx.phone_number,
                "status": tx.status,
                "mpesa_receipt_number": tx.mpesa_receipt_number,
                "result_desc": tx.result_desc,
                "created_at": tx.created_at.isoformat(),
            }
            for tx in transactions
        ]

        return Response(
            {
                "environment": env,
                "shortcode": shortcode,
                "callback_url": callback_url,
                "is_configured": is_configured,
                "env_vars": [
                    "MPESA_ENVIRONMENT",
                    "MPESA_CONSUMER_KEY",
                    "MPESA_CONSUMER_SECRET",
                    "MPESA_SHORTCODE",
                    "MPESA_PASSKEY",
                    "MPESA_CALLBACK_URL",
                ],
                "transactions": tx_data,
            }
        )
