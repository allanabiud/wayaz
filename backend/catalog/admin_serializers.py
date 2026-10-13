from rest_framework import serializers
from .models import Category, Product, ProductImage, ProductReview, StoreSettings


class AdminCategorySerializer(serializers.ModelSerializer):
    product_count = serializers.SerializerMethodField()

    def get_product_count(self, obj):
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
            "display_order",
            "product_count",
        )
        # Slug is derived from the name by the model; product_count is a read.
        read_only_fields = ("id", "slug", "product_count")


class AdminProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ("id", "image", "alt_text", "is_primary", "display_order")


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
    clear_logo = serializers.BooleanField(required=False, write_only=True, default=False)
    clear_favicon = serializers.BooleanField(required=False, write_only=True, default=False)

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

    def get_logo_url(self, obj):
        if not obj.logo:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(obj.logo.url) if request else obj.logo.url

    def get_favicon_url(self, obj):
        if not obj.favicon:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(obj.favicon.url) if request else obj.favicon.url

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

