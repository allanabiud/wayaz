from rest_framework import serializers
from .models import Category, Brand, Product, ProductImage, ProductVariant


class AdminVariantSerializer(serializers.ModelSerializer):
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


class AdminProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ("id", "image", "alt_text", "is_primary", "display_order")


class AdminProductSerializer(serializers.ModelSerializer):
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(), source="category", write_only=True
    )
    brand_id = serializers.PrimaryKeyRelatedField(
        queryset=Brand.objects.all(), source="brand", write_only=True, required=False, allow_null=True
    )
    category_name = serializers.CharField(source="category.name", read_only=True)
    brand_name = serializers.CharField(source="brand.name", default=None, read_only=True)
    variants = AdminVariantSerializer(many=True, required=False)
    images = AdminProductImageSerializer(many=True, read_only=True)
    total_stock = serializers.IntegerField(read_only=True)
    is_in_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = Product
        fields = (
            "id",
            "title",
            "slug",
            "category_id",
            "category_name",
            "brand_id",
            "brand_name",
            "description",
            "base_price",
            "sale_price",
            "is_featured",
            "is_trending",
            "is_new_arrival",
            "total_stock",
            "is_in_stock",
            "variants",
            "images",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "slug", "created_at", "updated_at")

    def create(self, validated_data):
        variants_data = validated_data.pop("variants", [])
        product = Product.objects.create(**validated_data)

        for variant_data in variants_data:
            ProductVariant.objects.create(product=product, **variant_data)

        return product

    def update(self, instance, validated_data):
        variants_data = validated_data.pop("variants", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if variants_data is not None:
            # Upsert variants
            existing_variant_ids = set()
            for vdata in variants_data:
                sku = vdata.get("sku")
                if sku:
                    variant, _ = ProductVariant.objects.update_or_create(
                        product=instance,
                        sku=sku,
                        defaults=vdata,
                    )
                    existing_variant_ids.add(variant.id)

        return instance
