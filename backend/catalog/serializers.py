from rest_framework import serializers
from .models import Category, Product, ProductImage, ProductReview


class CategorySerializer(serializers.ModelSerializer):
    product_count = serializers.IntegerField(source="products.count", read_only=True)

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
    # Rating summary - annotated onto the object by ProductViewSet.get_object()
    # for the detail route (see views.rating_payload).
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
    """Write serializer for the nested review endpoint (product + user are set
    by the view, so only the rating itself comes from the payload)."""

    class Meta:
        model = ProductReview
        fields = ("id", "rating", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")
