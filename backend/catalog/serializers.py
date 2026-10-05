from rest_framework import serializers
from .models import Category, Brand, Product, ProductImage, ProductVariant


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
            "is_featured",
            "display_order",
            "product_count",
        )


class BrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = ("id", "name", "slug", "logo", "is_featured")


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ("id", "image", "alt_text", "is_primary", "display_order")


class ProductVariantSerializer(serializers.ModelSerializer):
    effective_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )
    is_in_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = ProductVariant
        fields = (
            "id",
            "sku",
            "color_name",
            "color_hex",
            "size",
            "price_override",
            "effective_price",
            "stock_quantity",
            "is_in_stock",
        )


class ProductListSerializer(serializers.ModelSerializer):
    primary_image = serializers.SerializerMethodField()
    category = serializers.CharField(source="category.name", read_only=True)
    category_slug = serializers.CharField(source="category.slug", read_only=True)
    brand = serializers.CharField(source="brand.name", default=None, read_only=True)
    available_colors = serializers.SerializerMethodField()
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
            "brand",
            "base_price",
            "sale_price",
            "current_price",
            "is_on_sale",
            "is_in_stock",
            "is_featured",
            "is_trending",
            "is_new_arrival",
            "primary_image",
            "available_colors",
        )

    def get_primary_image(self, obj):
        img = obj.primary_image
        if img and img.image:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(img.image.url)
            return img.image.url
        return None

    def get_available_colors(self, obj):
        colors = []
        seen = set()
        for variant in obj.variants.all():
            if variant.color_hex and variant.color_hex not in seen:
                seen.add(variant.color_hex)
                colors.append(
                    {
                        "name": variant.color_name,
                        "hex": variant.color_hex,
                    }
                )
        return colors


class ProductDetailSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    brand = BrandSerializer(read_only=True)
    images = ProductImageSerializer(many=True, read_only=True)
    variants = ProductVariantSerializer(many=True, read_only=True)
    is_on_sale = serializers.BooleanField(read_only=True)
    current_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )
    is_in_stock = serializers.BooleanField(read_only=True)
    total_stock = serializers.IntegerField(read_only=True)
    available_colors = serializers.SerializerMethodField()
    available_sizes = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            "id",
            "title",
            "slug",
            "category",
            "brand",
            "description",
            "base_price",
            "sale_price",
            "current_price",
            "is_on_sale",
            "is_in_stock",
            "total_stock",
            "is_featured",
            "is_trending",
            "is_new_arrival",
            "images",
            "variants",
            "available_colors",
            "available_sizes",
            "created_at",
            "updated_at",
        )

    def get_available_colors(self, obj):
        colors = []
        seen = set()
        for variant in obj.variants.all():
            if variant.color_hex and variant.color_hex not in seen:
                seen.add(variant.color_hex)
                colors.append(
                    {
                        "name": variant.color_name,
                        "hex": variant.color_hex,
                    }
                )
        return colors

    def get_available_sizes(self, obj):
        sizes = []
        seen = set()
        for variant in obj.variants.all():
            if variant.size and variant.size not in seen:
                seen.add(variant.size)
                sizes.append(variant.size)
        return sizes
