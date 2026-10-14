from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import Coupon


class AdminCouponSerializer(serializers.ModelSerializer):
    """Coupons dashboard write model; money maths lives on
    Coupon.discount_for(), here we only police the shape."""

    order_count = serializers.SerializerMethodField()

    @extend_schema_field(serializers.IntegerField())
    def get_order_count(self, obj) -> int:
        # Annotated on the viewset queryset; freshly saved instances carry
        # no annotation, so fall back to a count.
        count = getattr(obj, "order_count", None)
        if count is not None:
            return count
        return obj.orders.count()

    def validate_code(self, value):
        # save() stores codes stripped + uppercase; a lowercase duplicate
        # would sail past the field's unique validator and blow up on INSERT.
        code = value.strip().upper()
        duplicates = Coupon.objects.filter(code=code)
        if self.instance is not None:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError("A coupon with this code already exists.")
        return code

    def validate_discount_value(self, value):
        if value <= 0:
            raise serializers.ValidationError("The discount must be greater than zero.")
        discount_type = self.initial_data.get("discount_type")
        if discount_type is None and self.instance is not None:
            discount_type = self.instance.discount_type
        if discount_type is None:
            discount_type = Coupon.DiscountType.PERCENT
        if discount_type == Coupon.DiscountType.PERCENT and value > 100:
            raise serializers.ValidationError("A percentage cannot exceed 100.")
        return value

    class Meta:
        model = Coupon
        fields = (
            "id",
            "code",
            "discount_type",
            "discount_value",
            "is_active",
            "audience",
            "auto_apply",
            "order_count",
            "created_at",
        )
        read_only_fields = ("id", "order_count", "created_at")


# Schema-only response serializers: they mirror the plain-dict payloads built
# in orders/admin_views.py so drf-spectacular can type them. Never instantiated
# at runtime - keep them in sync with admin_views.py.


class AdminOrderItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    product_title = serializers.CharField()
    unit_price = serializers.CharField(help_text="Money as a decimal string.")
    quantity = serializers.IntegerField()
    line_total = serializers.CharField(help_text="Money as a decimal string.")


class AdminOrderListItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    order_number = serializers.CharField()
    customer = serializers.CharField(help_text="shipping_name falling back to email.")
    email = serializers.EmailField()
    phone_number = serializers.CharField(allow_blank=True)
    county = serializers.CharField(allow_blank=True)
    town = serializers.CharField(allow_blank=True)
    street_address = serializers.CharField(allow_blank=True)
    status = serializers.CharField()
    status_display = serializers.CharField()
    payment_method = serializers.CharField()
    payment_method_display = serializers.CharField()
    payment_status = serializers.CharField()
    total_amount = serializers.CharField(help_text="Money as a decimal string.")
    subtotal = serializers.CharField(help_text="Money as a decimal string.")
    shipping_fee = serializers.CharField(help_text="Money as a decimal string.")
    item_count = serializers.IntegerField()
    items = AdminOrderItemSerializer(many=True)
    created_at = serializers.CharField(help_text="ISO 8601 timestamp.")


class AdminOrderListResponseSerializer(serializers.Serializer):
    count = serializers.IntegerField(help_text="Total orders matching the filters.")
    page = serializers.IntegerField()
    page_size = serializers.IntegerField()
    pending_count = serializers.IntegerField(
        help_text="Orders not yet delivered or cancelled (all statuses)."
    )
    results = AdminOrderListItemSerializer(many=True)


class AdminOrderDetailResponseSerializer(serializers.Serializer):
    order_number = serializers.CharField()
    status = serializers.CharField()
    status_display = serializers.CharField()
    payment_status = serializers.CharField()


class AdminPaymentListItemSerializer(serializers.Serializer):
    type = serializers.CharField(help_text='"mpesa" or "cod".')
    id = serializers.CharField(help_text='Composite id, e.g. "mpesa-12".')
    order_number = serializers.CharField()
    amount = serializers.CharField(help_text="Money as a decimal string.")
    phone = serializers.CharField(allow_blank=True)
    status = serializers.CharField()
    reference = serializers.CharField(
        help_text="M-Pesa receipt number; empty for cash payments."
    )
    note = serializers.CharField()
    date = serializers.CharField(help_text="ISO 8601 timestamp.")


class AdminPaymentsResponseSerializer(serializers.Serializer):
    count = serializers.IntegerField(help_text="Total payments matching the filters.")
    page = serializers.IntegerField()
    page_size = serializers.IntegerField()
    total_pages = serializers.IntegerField()
    results = AdminPaymentListItemSerializer(many=True)
