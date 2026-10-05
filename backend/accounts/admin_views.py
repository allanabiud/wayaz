from django.contrib.auth import get_user_model
from rest_framework import serializers, viewsets
from accounts.permissions import IsStaffOrAdminUser

User = get_user_model()


class AdminCustomerSerializer(serializers.ModelSerializer):
    addresses_count = serializers.IntegerField(source="addresses.count", read_only=True)
    wishlist_count = serializers.IntegerField(source="wishlist_items.count", read_only=True)
    display_name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "phone_number",
            "role",
            "display_name",
            "is_active",
            "date_joined",
            "addresses_count",
            "wishlist_count",
        )


class AdminCustomerViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = (
        User.objects.filter(role="customer")
        .prefetch_related("addresses", "wishlist_items")
        .order_by("-date_joined")
    )
    serializer_class = AdminCustomerSerializer
    permission_classes = [IsStaffOrAdminUser]
    lookup_field = "id"
