from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import (
    Category,
    ContactMessage,
    Product,
    ProductImage,
    ProductReview,
    RestockNotification,
    StoreSettings,
)


class CategorySerializer(serializers.ModelSerializer):
    product_count = serializers.SerializerMethodField()

    @extend_schema_field(serializers.IntegerField())
    def get_product_count(self, obj) -> int:
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
            "image",
            "icon",
            "display_order",
            "product_count",
        )


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ("id", "image", "alt_text", "is_primary", "display_order")


class SizeStockSerializer(serializers.Serializer):
    size = serializers.CharField()
    quantity = serializers.IntegerField()


class ProductListSerializer(serializers.ModelSerializer):
    primary_image = serializers.SerializerMethodField()
    category = serializers.CharField(source="category.name", read_only=True)
    category_slug = serializers.CharField(source="category.slug", read_only=True)
    is_on_sale = serializers.BooleanField(read_only=True)
    current_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )
    is_in_stock = serializers.BooleanField(read_only=True)
    # Storefront only offers sizes that are actually in stock.
    sizes = serializers.ListField(source="available_sizes", read_only=True)

    class Meta:
        model = Product
        fields = (
            "id",
            "title",
            "slug",
            "category",
            "category_slug",
            "base_price",
            "sale_price",
            "current_price",
            "is_on_sale",
            "is_in_stock",
            "sizes",
            "is_featured",
            "primary_image",
            "created_at",
        )

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_primary_image(self, obj) -> str | None:
        img = obj.primary_image
        if img and img.image:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(img.image.url)
            return img.image.url
        return None


class ProductDetailSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    images = ProductImageSerializer(many=True, read_only=True)
    is_on_sale = serializers.BooleanField(read_only=True)
    current_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )
    is_in_stock = serializers.BooleanField(read_only=True)
    # Total units across size rows (key kept for the storefront types).
    stock_quantity = serializers.IntegerField(source="total_stock", read_only=True)
    sizes = serializers.ListField(source="available_sizes", read_only=True)
    size_stock = serializers.SerializerMethodField()
    # Annotated by ProductViewSet.get_object for the detail route.
    average_rating = serializers.SerializerMethodField()
    rating_count = serializers.SerializerMethodField()
    user_rating = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            "id",
            "title",
            "slug",
            "category",
            "description",
            "base_price",
            "sale_price",
            "current_price",
            "is_on_sale",
            "is_in_stock",
            "stock_quantity",
            "sizes",
            "size_stock",
            "images",
            "average_rating",
            "rating_count",
            "user_rating",
            "created_at",
            "updated_at",
        )

    @extend_schema_field(serializers.FloatField(allow_null=True))
    def get_average_rating(self, obj) -> float | None:
        return getattr(obj, "average_rating", None)

    @extend_schema_field(serializers.IntegerField())
    def get_rating_count(self, obj) -> int:
        return getattr(obj, "rating_count", 0)

    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_user_rating(self, obj) -> int | None:
        return getattr(obj, "user_rating", None)

    @extend_schema_field(SizeStockSerializer(many=True))
    def get_size_stock(self, obj):
        # Only buyable rows, mirroring `sizes`.
        rows = [row for row in obj.size_stock.all() if row.size and row.quantity > 0]
        return SizeStockSerializer(rows, many=True).data


class ProductReviewSerializer(serializers.ModelSerializer):
    """Write serializer for the nested review endpoint (product and user are
    set by the view). `comment` is optional; omitting it leaves it untouched."""

    class Meta:
        model = ProductReview
        fields = ("id", "rating", "comment", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class ProductReviewListSerializer(serializers.ModelSerializer):
    """Public read model for the storefront review list."""

    reviewer = serializers.CharField(source="user.display_name", read_only=True)
    mine = serializers.SerializerMethodField()

    def get_mine(self, obj):
        # Lets a signed-in author spot (and re-open) their own review.
        user = self.context.get("request").user if self.context.get("request") else None
        return bool(user and user.is_authenticated and obj.user_id == user.id)

    class Meta:
        model = ProductReview
        fields = ("id", "rating", "comment", "reviewer", "mine", "created_at")
        read_only_fields = fields


class StoreSettingsSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()
    favicon_url = serializers.SerializerMethodField()

    class Meta:
        model = StoreSettings
        fields = (
            "store_name",
            "tagline",
            "logo_url",
            "favicon_url",
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
            "updated_at",
        )

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


class ContactMessageCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactMessage
        fields = ("id", "name", "email", "phone", "subject", "message", "created_at")
        read_only_fields = ("id", "created_at")

    def validate_name(self, value):
        val = value.strip()
        if not val:
            raise serializers.ValidationError("Name cannot be blank.")
        return val

    def validate_subject(self, value):
        val = value.strip()
        if not val:
            raise serializers.ValidationError("Subject cannot be blank.")
        return val

    def validate_message(self, value):
        val = value.strip()
        if not val:
            raise serializers.ValidationError("Message cannot be blank.")
        return val


class RestockNotificationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = RestockNotification
        fields = ("id", "product", "email", "phone", "created_at")
        read_only_fields = ("id", "created_at")
        # Uniqueness is handled as "already subscribed" in the view, not as
        # a 400; an auto-generated validator would break repeat taps.
        validators = []

    def validate_email(self, value):
        val = value.strip().lower()
        if not val:
            raise serializers.ValidationError("Email cannot be blank.")
        return val
