import uuid
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from catalog.models import Product
from .delivery import DELIVERY_ZONES
from .models import Cart, CartItem, Order, OrderItem


class CartItemProductSerializer(serializers.ModelSerializer):
    product_title = serializers.CharField(source="title", read_only=True)
    product_slug = serializers.CharField(source="slug", read_only=True)
    thumbnail = serializers.SerializerMethodField()
    # Product.is_in_stock is a @property; declare it so the schema types it
    # as a boolean instead of defaulting to string.
    is_in_stock = serializers.BooleanField(read_only=True)
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
            "sizes",
            "thumbnail",
        )

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_thumbnail(self, obj) -> str | None:
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
            # Sized products must name one of their offered sizes.
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
    # Cart lines are unique per (cart, product, size), so the cart views can
    # re-point a line at another size without a second request. Membership in
    # the product's size list is checked in the view, which has the line.
    size = serializers.CharField(max_length=50, required=False, allow_blank=True)

    def validate(self, attrs):
        if (
            "quantity" not in attrs
            and "product_id" not in attrs
            and "size" not in attrs
        ):
            raise serializers.ValidationError(
                "Provide 'quantity', 'product_id' or 'size'."
            )

        if "product_id" in attrs:
            try:
                product = Product.objects.get(id=attrs["product_id"])
                attrs["product_obj"] = product
            except Product.DoesNotExist:
                raise serializers.ValidationError({"product_id": "Product does not exist."})

        return attrs


class MergeCartSerializer(serializers.Serializer):
    guest_cart_id = serializers.UUIDField()


class CouponValidateSerializer(serializers.Serializer):
    """Dry-run request for CouponValidateView (no cart maths here).

    Omitting (or blanking) the code asks for the best auto-applying
    coupon instead - that is how checkout previews one without the
    shopper typing anything.
    """

    code = serializers.CharField(
        max_length=40, required=False, allow_blank=True
    )


class CheckoutSerializer(serializers.Serializer):
    """Customer details, delivery selection, and payment method (Step 6.4)."""

    email = serializers.EmailField()
    phone_number = serializers.CharField(max_length=25)
    full_name = serializers.CharField(max_length=150)
    county = serializers.CharField(max_length=100)
    town = serializers.CharField(max_length=100)
    street_address = serializers.CharField(max_length=255)
    delivery_method = serializers.ChoiceField(
        choices=[(key, zone["label"]) for key, zone in DELIVERY_ZONES.items()],
        required=False,
        default="free",
    )
    payment_method = serializers.ChoiceField(
        choices=Order.PaymentMethod.choices, default=Order.PaymentMethod.COD
    )
    guest_id = serializers.CharField(
        max_length=64, required=False, allow_blank=True, default=""
    )
    # Optional; validated against the Coupon table inside the checkout
    # transaction so the discount can never be forged by the client.
    # Key absent = no opinion, let an auto-applying coupon claim the
    # order; blank string = the shopper explicitly wants no coupon.
    coupon_code = serializers.CharField(
        max_length=40, required=False, allow_blank=True
    )


class OrderItemSerializer(serializers.ModelSerializer):
    line_total = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )
    # Live catalog slug for "buy again" links; null once the product is
    # removed from the catalog (SET_NULL snapshot).
    product_slug = serializers.SlugRelatedField(
        source="product", read_only=True, slug_field="slug"
    )

    class Meta:
        model = OrderItem
        fields = (
            "id",
            "product_slug",
            "product_title",
            "unit_price",
            "quantity",
            "line_total",
        )


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    whatsapp_link = serializers.SerializerMethodField()
    coupon_code = serializers.SerializerMethodField()
    item_count = serializers.IntegerField(read_only=True)
    # Human-readable labels so the storefront never re-learns backend choices.
    status_display = serializers.CharField(
        source="get_status_display", read_only=True
    )
    payment_method_display = serializers.CharField(
        source="get_payment_method_display", read_only=True
    )
    delivery_method_display = serializers.CharField(
        source="get_delivery_method_display", read_only=True
    )

    class Meta:
        model = Order
        fields = (
            "id",
            "order_number",
            "status",
            "status_display",
            "payment_method",
            "payment_method_display",
            "payment_status",
            "email",
            "phone_number",
            "shipping_name",
            "county",
            "town",
            "street_address",
            "delivery_method",
            "delivery_method_display",
            "subtotal",
            "coupon_code",
            "discount_amount",
            "shipping_fee",
            "total_amount",
            "item_count",
            "items",
            "whatsapp_link",
            "created_at",
        )

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_coupon_code(self, obj) -> str | None:
        return obj.coupon.code if obj.coupon else None

    @extend_schema_field(serializers.CharField())
    def get_whatsapp_link(self, obj) -> str:
        return obj.whatsapp_link
