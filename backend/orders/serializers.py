import uuid
from rest_framework import serializers
from catalog.models import ProductVariant
from .models import Cart, CartItem


class CartItemVariantSerializer(serializers.ModelSerializer):
    product_title = serializers.CharField(source="product.title", read_only=True)
    product_slug = serializers.CharField(source="product.slug", read_only=True)
    thumbnail = serializers.SerializerMethodField()
    unit_price = serializers.DecimalField(
        source="effective_price", max_digits=10, decimal_places=2, read_only=True
    )

    class Meta:
        model = ProductVariant
        fields = (
            "id",
            "sku",
            "product_title",
            "product_slug",
            "color_name",
            "color_hex",
            "size",
            "unit_price",
            "stock_quantity",
            "is_in_stock",
            "thumbnail",
        )

    def get_thumbnail(self, obj):
        img = obj.product.primary_image
        if img and img.image:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(img.image.url)
            return img.image.url
        return None


class CartItemSerializer(serializers.ModelSerializer):
    variant = CartItemVariantSerializer(read_only=True)
    unit_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )
    line_total = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )

    class Meta:
        model = CartItem
        fields = ("id", "variant", "quantity", "unit_price", "line_total", "added_at")


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    total_items = serializers.IntegerField(read_only=True)
    subtotal = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )
    has_free_shipping = serializers.BooleanField(read_only=True)
    amount_to_free_shipping = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )

    class Meta:
        model = Cart
        fields = (
            "id",
            "total_items",
            "subtotal",
            "has_free_shipping",
            "amount_to_free_shipping",
            "items",
            "created_at",
            "updated_at",
        )


class AddToCartSerializer(serializers.Serializer):
    variant_id = serializers.IntegerField()
    quantity = serializers.IntegerField(default=1, min_value=1)

    def validate_variant_id(self, value):
        try:
            variant = ProductVariant.objects.get(id=value)
        except ProductVariant.DoesNotExist:
            raise serializers.ValidationError("Product variant does not exist.")

        if variant.stock_quantity <= 0:
            raise serializers.ValidationError("This item variant is currently out of stock.")

        return value


class UpdateCartItemSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(required=False, min_value=1)
    variant_id = serializers.IntegerField(required=False)

    def validate(self, attrs):
        if "quantity" not in attrs and "variant_id" not in attrs:
            raise serializers.ValidationError("Provide either 'quantity' or 'variant_id'.")

        if "variant_id" in attrs:
            try:
                variant = ProductVariant.objects.get(id=attrs["variant_id"])
                attrs["variant_obj"] = variant
            except ProductVariant.DoesNotExist:
                raise serializers.ValidationError({"variant_id": "Variant does not exist."})

        return attrs


class MergeCartSerializer(serializers.Serializer):
    guest_cart_id = serializers.UUIDField()
