import uuid
from rest_framework import serializers
from catalog.models import Product
from .models import Cart, CartItem


class CartItemProductSerializer(serializers.ModelSerializer):
    product_title = serializers.CharField(source="title", read_only=True)
    product_slug = serializers.CharField(source="slug", read_only=True)
    thumbnail = serializers.SerializerMethodField()
    unit_price = serializers.DecimalField(
        source="current_price", max_digits=10, decimal_places=2, read_only=True
    )

    class Meta:
        model = Product
        fields = (
            "id",
            "product_title",
            "product_slug",
            "unit_price",
            "stock_quantity",
            "is_in_stock",
            "thumbnail",
        )

    def get_thumbnail(self, obj):
        primary = obj.primary_image
        url = primary.image.url if primary and primary.image else None
        if url:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(url)
            return url
        return None


class CartItemSerializer(serializers.ModelSerializer):
    product = CartItemProductSerializer(read_only=True)
    unit_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )
    line_total = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )

    class Meta:
        model = CartItem
        fields = (
            "id",
            "product",
            "size",
            "quantity",
            "unit_price",
            "line_total",
            "added_at",
        )


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    total_items = serializers.IntegerField(read_only=True)
    subtotal = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )

    class Meta:
        model = Cart
        fields = (
            "id",
            "total_items",
            "subtotal",
            "items",
            "created_at",
            "updated_at",
        )


class AddToCartSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(default=1, min_value=1)
    size = serializers.CharField(
        max_length=50, required=False, allow_blank=True, default=""
    )

    def validate_product_id(self, value):
        try:
            product = Product.objects.get(id=value)
        except Product.DoesNotExist:
            raise serializers.ValidationError("Product does not exist.")

        if product.stock_quantity <= 0:
            raise serializers.ValidationError("This product is currently out of stock.")

        return value

    def validate(self, attrs):
        product = Product.objects.get(id=attrs["product_id"])
        size = (attrs.get("size") or "").strip()

        if product.sizes:
            # Sized products must name one of their offered sizes, so a
            # sizeless line can never exist for them.
            if not size:
                raise serializers.ValidationError(
                    {"size": "Select a size for this product."}
                )
            if size not in product.sizes:
                raise serializers.ValidationError(
                    {"size": f"Choose one of: {', '.join(product.sizes)}."}
                )
        else:
            size = ""

        attrs["size"] = size
        return attrs


class UpdateCartItemSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(required=False, min_value=1)
    product_id = serializers.IntegerField(required=False)

    def validate(self, attrs):
        if "quantity" not in attrs and "product_id" not in attrs:
            raise serializers.ValidationError("Provide either 'quantity' or 'product_id'.")

        if "product_id" in attrs:
            try:
                product = Product.objects.get(id=attrs["product_id"])
                attrs["product_obj"] = product
            except Product.DoesNotExist:
                raise serializers.ValidationError({"product_id": "Product does not exist."})

        return attrs


class MergeCartSerializer(serializers.Serializer):
    guest_cart_id = serializers.UUIDField()

