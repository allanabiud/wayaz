import os

from rest_framework import serializers
from .models import Category, Product, ProductImage, ProductReview, StoreSettings

ALLOWED_PRODUCT_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
PRODUCT_IMAGE_MAX_UPLOAD_MB = 5


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


class AdminProductImageUploadSerializer(serializers.Serializer):
    """Validated multipart upload for a product image.

    ImageField opens the file with Pillow, so a ".jpg" that isn't really an
    image is rejected; this adds an extension allowlist and a size cap, and
    types the metadata fields so garbage input 400s instead of crashing the
    old raw `int()` parsing.
    """

    image = serializers.ImageField()
    is_primary = serializers.BooleanField(default=False)
    alt_text = serializers.CharField(
        required=False, allow_blank=True, max_length=255
    )
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
            except Exception:
                raise serializers.ValidationError("Invalid JSON for support phones.")
        if not isinstance(value, list):
            raise serializers.ValidationError("Support phones must be a list.")
        if len(value) > 6:
            raise serializers.ValidationError("A maximum of 6 support phones are allowed.")
        phone_regex = re.compile(r"^\+?[0-9\s\-()]{7,25}$")
        cleaned = []
        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError("Each support phone entry must be an object.")
            label = str(item.get("label", "")).strip()
            number = str(item.get("number", "")).strip()
            if not label:
                raise serializers.ValidationError("Department / Label is required for each phone.")
            if len(label) > 40:
                raise serializers.ValidationError("Label must be 40 characters or fewer.")
            if not number:
                raise serializers.ValidationError("Phone number is required.")
            if not phone_regex.match(number):
                raise serializers.ValidationError(f"Invalid phone number format: '{number}'.")
            cleaned.append({"label": label, "number": number})
        return cleaned

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

