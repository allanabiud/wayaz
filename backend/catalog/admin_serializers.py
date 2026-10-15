import os

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import (
    Category,
    ContactMessage,
    Product,
    ProductImage,
    ProductReview,
    StoreSettings,
)

ALLOWED_PRODUCT_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
PRODUCT_IMAGE_MAX_UPLOAD_MB = 5


class AdminCategorySerializer(serializers.ModelSerializer):
    product_count = serializers.SerializerMethodField()

    @extend_schema_field(serializers.IntegerField())
    def get_product_count(self, obj) -> int:
        # Annotated on the viewset queryset (O(1)); instances that were just
        # created or updated carry no annotation, so fall back to a count.
        count = getattr(obj, "product_count", None)
        if count is not None:
            return count
        return obj.products.count()

    class Meta:
        model = Category
        fields = (
            "id",
            "name",
            "slug",
            "description",
            "icon",
            "display_order",
            "product_count",
        )
        # Slug is derived from the name by the model; product_count is a read.
        read_only_fields = ("id", "slug", "product_count")


class AdminProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ("id", "image", "alt_text", "is_primary", "display_order")


class AdminProductImageUploadSerializer(serializers.Serializer):
    """Validated multipart upload for a product image. ImageField + Pillow
    reject fake images; this adds an extension allowlist, a size cap, and
    types the metadata so garbage input 400s instead of crashing."""

    image = serializers.ImageField()
    is_primary = serializers.BooleanField(default=False)
    alt_text = serializers.CharField(required=False, allow_blank=True, max_length=255)
    display_order = serializers.IntegerField(min_value=0, max_value=1000, default=0)

    def validate_image(self, image):
        ext = os.path.splitext(image.name or "")[1].lower()
        if ext not in ALLOWED_PRODUCT_IMAGE_EXTENSIONS:
            raise serializers.ValidationError(
                "Only JPG, PNG, or WebP images are allowed."
            )
        max_bytes = PRODUCT_IMAGE_MAX_UPLOAD_MB * 1024 * 1024
        if image.size > max_bytes:
            raise serializers.ValidationError(
                f"Image must be smaller than {PRODUCT_IMAGE_MAX_UPLOAD_MB}MB."
            )
        return image


class AdminProductSerializer(serializers.ModelSerializer):
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(), source="category"
    )
    category_name = serializers.CharField(source="category.name", read_only=True)
    images = AdminProductImageSerializer(many=True, read_only=True)
    is_in_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = Product
        fields = (
            "id",
            "title",
            "slug",
            "category_id",
            "category_name",
            "description",
            "base_price",
            "sale_price",
            "stock_quantity",
            "sizes",
            "is_featured",
            "is_in_stock",
            "images",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "slug", "created_at", "updated_at")

    def validate_sizes(self, value):
        """Accept a list of size labels; trim, drop blanks, dedupe, keep order."""
        if not isinstance(value, list):
            raise serializers.ValidationError("Sizes must be a list.")
        cleaned = []
        for item in value:
            text = str(item).strip()
            if not text:
                continue
            if len(text) > 50:
                raise serializers.ValidationError(
                    "Each size must be 50 characters or fewer."
                )
            if text not in cleaned:
                cleaned.append(text)
        if len(cleaned) > 30:
            raise serializers.ValidationError("A product can have at most 30 sizes.")
        return cleaned


class AdminReviewSerializer(serializers.ModelSerializer):
    """Moderation view of a review. Only `is_approved` is writable: staff
    hide or restore reviews, they do not rewrite them."""

    product_title = serializers.CharField(source="product.title", read_only=True)
    product_slug = serializers.SlugField(source="product.slug", read_only=True)
    reviewer = serializers.CharField(source="user.display_name", read_only=True)

    class Meta:
        model = ProductReview
        fields = (
            "id",
            "product_title",
            "product_slug",
            "reviewer",
            "rating",
            "comment",
            "is_approved",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "product_title",
            "product_slug",
            "reviewer",
            "rating",
            "comment",
            "created_at",
            "updated_at",
        )


class AdminStoreSettingsSerializer(serializers.ModelSerializer):
    logo = serializers.ImageField(required=False, allow_null=True)
    favicon = serializers.ImageField(required=False, allow_null=True)
    logo_url = serializers.SerializerMethodField()
    favicon_url = serializers.SerializerMethodField()
    clear_logo = serializers.BooleanField(
        required=False, write_only=True, default=False
    )
    clear_favicon = serializers.BooleanField(
        required=False, write_only=True, default=False
    )

    class Meta:
        model = StoreSettings
        fields = (
            "store_name",
            "tagline",
            "logo",
            "favicon",
            "logo_url",
            "favicon_url",
            "clear_logo",
            "clear_favicon",
            "whatsapp_number",
            "whatsapp_message",
            "contact_phone",
            "support_phones",
            "contact_email",
            "address",
            "instagram_url",
            "facebook_url",
            "tiktok_url",
            "twitter_url",
            "youtube_url",
            "announcement_text",
            "is_announcement_active",
            "mpesa_shortcode",
            "updated_at",
        )
        read_only_fields = ("updated_at",)

    def validate_support_phones(self, value):
        import json
        import re

        if isinstance(value, str):
            try:
                value = json.loads(value)
            except Exception as exc:
                raise serializers.ValidationError(
                    "Invalid JSON for support phones."
                ) from exc
        if not isinstance(value, list):
            raise serializers.ValidationError("Support phones must be a list.")
        if len(value) > 6:
            raise serializers.ValidationError(
                "A maximum of 6 support phones are allowed."
            )
        phone_regex = re.compile(r"^\+?[0-9\s\-()]{7,25}$")
        cleaned = []
        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError(
                    "Each support phone entry must be an object."
                )
            label = str(item.get("label", "")).strip()
            number = str(item.get("number", "")).strip()
            if not label:
                raise serializers.ValidationError(
                    "Department / Label is required for each phone."
                )
            if len(label) > 40:
                raise serializers.ValidationError(
                    "Label must be 40 characters or fewer."
                )
            if not number:
                raise serializers.ValidationError("Phone number is required.")
            if not phone_regex.match(number):
                raise serializers.ValidationError(
                    f"Invalid phone number format: '{number}'."
                )
            cleaned.append({"label": label, "number": number})
        return cleaned

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_logo_url(self, obj) -> str | None:
        if not obj.logo:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(obj.logo.url) if request else obj.logo.url

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_favicon_url(self, obj) -> str | None:
        if not obj.favicon:
            return None
        request = self.context.get("request")
        return (
            request.build_absolute_uri(obj.favicon.url) if request else obj.favicon.url
        )

    def update(self, instance, validated_data):
        clear_logo = validated_data.pop("clear_logo", False)
        clear_favicon = validated_data.pop("clear_favicon", False)

        if clear_logo:
            if instance.logo:
                instance.logo.delete(save=False)
            instance.logo = None

        if clear_favicon:
            if instance.favicon:
                instance.favicon.delete(save=False)
            instance.favicon = None

        return super().update(instance, validated_data)


class AdminContactMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactMessage
        fields = (
            "id",
            "name",
            "email",
            "phone",
            "subject",
            "message",
            "is_read",
            "created_at",
        )
        read_only_fields = (
            "id",
            "name",
            "email",
            "phone",
            "subject",
            "message",
            "created_at",
        )


# ---------------------------------------------------------------------------
# Schema-only response serializers for the admin APIViews
# ---------------------------------------------------------------------------
# The dashboard views assemble plain dicts in one annotated aggregate pass;
# these classes mirror that payload shape so drf-spectacular can type it.
# They are never instantiated at runtime - keep them in sync with admin_views.py.


class AdminErrorDetailSerializer(serializers.Serializer):
    """Shared {"detail": "..."} error body returned by the admin views."""

    detail = serializers.CharField()


class AdminNavCountsResponseSerializer(serializers.Serializer):
    """Sidebar badges: one count per admin section."""

    orders = serializers.IntegerField()
    products = serializers.IntegerField()
    categories = serializers.IntegerField()
    reviews = serializers.IntegerField()
    coupons = serializers.IntegerField()
    team = serializers.IntegerField()
    customers = serializers.IntegerField()
    payments = serializers.IntegerField()
    messages = serializers.IntegerField()


class AdminDeltaSerializer(serializers.Serializer):
    """Period-over-period comparison: raw values and the % change."""

    current = serializers.FloatField()
    previous = serializers.FloatField()
    percent = serializers.FloatField()


class AdminPeriodDeltasSerializer(serializers.Serializer):
    today = AdminDeltaSerializer()
    week = AdminDeltaSerializer()
    month = AdminDeltaSerializer()


class AdminTimeMetricsSerializer(serializers.Serializer):
    revenue = AdminPeriodDeltasSerializer()
    orders = AdminPeriodDeltasSerializer()
    customers = AdminPeriodDeltasSerializer()


class AdminOverviewKpisSerializer(serializers.Serializer):
    total_products = serializers.IntegerField()
    total_stock_units = serializers.IntegerField()
    out_of_stock_count = serializers.IntegerField()
    total_categories = serializers.IntegerField()
    total_customers = serializers.IntegerField()
    products_added_this_month = serializers.IntegerField()
    new_customers_this_month = serializers.IntegerField()


class AdminTopProductSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    units_sold = serializers.IntegerField()
    revenue = serializers.FloatField()


class AdminWishlistProductSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    saves = serializers.IntegerField()
    price = serializers.FloatField()
    stock = serializers.IntegerField()


class AdminSalesSummarySerializer(serializers.Serializer):
    units_sold = serializers.IntegerField()
    wishlist_saves = serializers.IntegerField()


class AdminSeriesPointSerializer(serializers.Serializer):
    """One bucket of a revenue timeline. ``date`` is an ISO date for daily
    series and an ``HH:00`` label for the intraday one."""

    date = serializers.CharField()
    revenue = serializers.FloatField()
    orders = serializers.IntegerField()


class AdminOrdersPointSerializer(serializers.Serializer):
    """One bucket of an order-count timeline (every order, not just paid)."""

    date = serializers.CharField()
    orders = serializers.IntegerField()


class AdminWeeklyOrdersPointSerializer(serializers.Serializer):
    week_start = serializers.CharField()
    orders = serializers.IntegerField()


class AdminRevenueSummarySerializer(serializers.Serializer):
    total = serializers.FloatField()
    this_month = serializers.FloatField()
    orders_total = serializers.IntegerField()
    orders_this_month = serializers.IntegerField()
    pending_orders = serializers.IntegerField()
    prev_30d = serializers.FloatField()


class AdminStockCategorySerializer(serializers.Serializer):
    name = serializers.CharField(help_text='Category name, or "Uncategorized".')
    units = serializers.IntegerField()
    products = serializers.IntegerField()


class AdminActivitySerializer(serializers.Serializer):
    type = serializers.CharField(help_text='"order", "product" or "customer".')
    title = serializers.CharField()
    detail = serializers.CharField()
    at = serializers.CharField(help_text="ISO 8601 timestamp.")


class AdminLowStockAlertSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    product_title = serializers.CharField()
    image_url = serializers.CharField(allow_null=True)
    stock_quantity = serializers.IntegerField()


class AdminOverviewResponseSerializer(serializers.Serializer):
    """Dashboard landing payload: KPIs, period deltas and chart series."""

    kpis = AdminOverviewKpisSerializer()
    time_metrics = AdminTimeMetricsSerializer()
    top_products = AdminTopProductSerializer(many=True)
    top_wishlisted = AdminWishlistProductSerializer(many=True)
    sales_summary = AdminSalesSummarySerializer()
    revenue_series = AdminSeriesPointSerializer(many=True)
    revenue_series_today = AdminSeriesPointSerializer(many=True)
    revenue_series_week = AdminSeriesPointSerializer(many=True)
    revenue_series_month = AdminSeriesPointSerializer(many=True)
    revenue_summary = AdminRevenueSummarySerializer()
    orders_series = AdminWeeklyOrdersPointSerializer(many=True)
    orders_series_today = AdminOrdersPointSerializer(many=True)
    orders_series_week = AdminOrdersPointSerializer(many=True)
    orders_series_month = AdminOrdersPointSerializer(many=True)
    stock_by_category = AdminStockCategorySerializer(many=True)
    recent_activity = AdminActivitySerializer(many=True)
    low_stock_alerts = AdminLowStockAlertSerializer(many=True)


class AdminAnalyticsKpisSerializer(serializers.Serializer):
    gross_sales = serializers.FloatField()
    net_sales = serializers.FloatField()
    total_discount = serializers.FloatField()
    total_orders = serializers.IntegerField()
    completed_orders = serializers.IntegerField()
    cancelled_orders = serializers.IntegerField()
    aov = serializers.FloatField(help_text="Average order value.")
    fulfillment_rate = serializers.FloatField(help_text="Percent delivered.")
    cancellation_rate = serializers.FloatField(help_text="Percent cancelled.")
    repeat_customer_rate = serializers.FloatField(help_text="Percent repeat buyers.")


class AdminStatusDistributionSerializer(serializers.Serializer):
    status = serializers.CharField()
    label = serializers.CharField()
    count = serializers.IntegerField()


class AdminPaymentMethodBucketSerializer(serializers.Serializer):
    payment_method = serializers.CharField()
    count = serializers.IntegerField()
    volume = serializers.FloatField(help_text="Sum of order totals.")


class AdminAnalyticsTopProductSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(allow_null=True)
    title = serializers.CharField()
    units_sold = serializers.IntegerField()
    revenue = serializers.FloatField()


class AdminDestinationSerializer(serializers.Serializer):
    county = serializers.CharField(allow_blank=True)
    orders = serializers.IntegerField()
    volume = serializers.FloatField(help_text="Sum of order totals.")


class AdminDeadStockSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    stock_quantity = serializers.IntegerField()
    base_price = serializers.FloatField()


class AdminAnalyticsResponseSerializer(serializers.Serializer):
    """Reporting payload for a selected period or custom date range."""

    period = serializers.CharField(help_text='Echo of ?period (or "custom").')
    start_date = serializers.CharField(help_text="ISO date.")
    end_date = serializers.CharField(help_text="ISO date.")
    kpis = AdminAnalyticsKpisSerializer()
    timeline = AdminSeriesPointSerializer(many=True)
    status_distribution = AdminStatusDistributionSerializer(many=True)
    payment_methods = AdminPaymentMethodBucketSerializer(many=True)
    top_products = AdminAnalyticsTopProductSerializer(many=True)
    destinations = AdminDestinationSerializer(many=True)
    dead_stock = AdminDeadStockSerializer(many=True)


class AdminMpesaTransactionSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    order_number = serializers.CharField()
    amount = serializers.CharField(help_text="Money as a decimal string.")
    phone_number = serializers.CharField()
    status = serializers.CharField()
    mpesa_receipt_number = serializers.CharField(allow_null=True, allow_blank=True)
    result_desc = serializers.CharField(allow_null=True, allow_blank=True)
    created_at = serializers.CharField(help_text="ISO 8601 timestamp.")


class AdminMpesaConfigResponseSerializer(serializers.Serializer):
    """Non-sensitive M-Pesa configuration status plus recent transactions.
    Credentials (Consumer Key, Secret, Passkey) are never exposed."""

    environment = serializers.CharField()
    shortcode = serializers.CharField()
    callback_url = serializers.CharField()
    is_configured = serializers.BooleanField()
    env_vars = serializers.ListField(
        child=serializers.CharField(),
        help_text="Environment variables the integration expects.",
    )
    transactions = AdminMpesaTransactionSerializer(
        many=True, help_text="Last 50 transactions, newest first."
    )


class AdminProductImageUploadResponseSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    url = serializers.CharField()
    is_primary = serializers.BooleanField()
    display_order = serializers.IntegerField()
