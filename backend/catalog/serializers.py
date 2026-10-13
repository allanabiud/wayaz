from rest_framework import serializers
from .models import Category, Product, ProductImage, ProductReview, StoreSettings


class CategorySerializer(serializers.ModelSerializer):
    product_count = serializers.SerializerMethodField()

    def get_product_count(self, obj):
        # Use annotated value if present (O(1)), else fallback
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
            "display_order",
            "product_count",
        )


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ("id", "image", "alt_text", "is_primary", "display_order")


class ProductListSerializer(serializers.ModelSerializer):
    primary_image = serializers.SerializerMethodField()
    category = serializers.CharField(source="category.name", read_only=True)
    category_slug = serializers.CharField(source="category.slug", read_only=True)
    is_on_sale = serializers.BooleanField(read_only=True)
    current_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )
    is_in_stock = serializers.BooleanField(read_only=True)

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

    def get_primary_image(self, obj):
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
            "images",
            "average_rating",
            "rating_count",
            "user_rating",
            "created_at",
            "updated_at",
        )

    def get_average_rating(self, obj):
        return getattr(obj, "average_rating", None)

    def get_rating_count(self, obj):
        return getattr(obj, "rating_count", 0)

    def get_user_rating(self, obj):
        return getattr(obj, "user_rating", None)


class ProductReviewSerializer(serializers.ModelSerializer):
    """Write serializer for the nested review endpoint (product and user are
    set by the view). `comment` is optional: a bare star rating is still a
    valid submission, and omitting it leaves any existing comment untouched."""

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

