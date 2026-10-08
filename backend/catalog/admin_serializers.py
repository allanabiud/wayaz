from rest_framework import serializers
from .models import Category, Product, ProductImage


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
