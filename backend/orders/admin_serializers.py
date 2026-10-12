from rest_framework import serializers

from .models import Coupon


class AdminCouponSerializer(serializers.ModelSerializer):
    """Write model for the coupons dashboard.

    The money maths lives on Coupon.discount_for(); here we only police the
    shape of a coupon: a positive value, and a percentage that cannot
    exceed 100.
    """

    order_count = serializers.SerializerMethodField()

    def get_order_count(self, obj):
        # Annotated on the viewset queryset (O(1)); freshly saved instances
        # carry no annotation, so fall back to a count.
        count = getattr(obj, "order_count", None)
        if count is not None:
            return count
        return obj.orders.count()

    def validate_code(self, value):
        # save() stores codes stripped + uppercase; mirror that here, or a
        # lowercase duplicate would sail past the field's unique validator
        # (it checks the raw text) and blow up on the INSERT instead.
        code = value.strip().upper()
        duplicates = Coupon.objects.filter(code=code)
        if self.instance is not None:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError(
                "A coupon with this code already exists."
            )
        return code

    def validate_discount_value(self, value):
        if value <= 0:
            raise serializers.ValidationError(
                "The discount must be greater than zero."
            )
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
            "order_count",
            "created_at",
        )
        read_only_fields = ("id", "order_count", "created_at")
