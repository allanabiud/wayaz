from django.contrib.auth import get_user_model
from rest_framework import serializers, status, viewsets
from rest_framework.response import Response

from accounts.permissions import IsStaffOrAdminUser

User = get_user_model()

# The two roles that can reach the dashboard; customers never appear here.
TEAM_ROLES = (User.Role.ADMIN, User.Role.STAFF)

LAST_ADMIN_MESSAGE = "This is the last active admin - promote someone else first."


class AdminCustomerSerializer(serializers.ModelSerializer):
    addresses_count = serializers.IntegerField(source="addresses.count", read_only=True)
    wishlist_count = serializers.IntegerField(
        source="wishlist_items.count", read_only=True
    )
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


class AdminTeamSerializer(serializers.ModelSerializer):
    """Credentials plus the role that decides dashboard reach. Password is
    write-only: required when creating, optional on update."""

    password = serializers.CharField(write_only=True, min_length=8, required=False)
    display_name = serializers.CharField(read_only=True)
    role_display = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "password",
            "first_name",
            "last_name",
            "phone_number",
            "role",
            "role_display",
            "display_name",
            "is_active",
            "last_login",
            "date_joined",
        )
        read_only_fields = ("id", "last_login", "date_joined")

    def validate_role(self, value):
        if value not in TEAM_ROLES:
            raise serializers.ValidationError(
                "Team members are staff or admins, never customers."
            )
        return value

    def validate(self, attrs):
        if self.instance is None and "password" not in attrs:
            raise serializers.ValidationError({"password": "A password is required."})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class AdminTeamViewSet(viewsets.ModelViewSet):
    """Who can log into the dashboard. Any staff member may look; every
    write is admin-only. Nobody can deactivate themselves, and the last
    active admin can be neither demoted, deactivated nor removed."""

    queryset = User.objects.filter(role__in=TEAM_ROLES).order_by("-date_joined")
    serializer_class = AdminTeamSerializer
    permission_classes = [IsStaffOrAdminUser]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    lookup_field = "id"

    def _require_admin(self):
        user = self.request.user
        if not (user.is_superuser or user.role == User.Role.ADMIN):
            self.permission_denied(
                self.request, message="Only admins can manage the team."
            )

    def _is_last_active_admin(self, user):
        return (
            user.role == User.Role.ADMIN
            and user.is_active
            and not User.objects.filter(role=User.Role.ADMIN, is_active=True)
            .exclude(pk=user.pk)
            .exists()
        )

    def create(self, request, *args, **kwargs):
        self._require_admin()
        return super().create(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._require_admin()
        user = self.get_object()

        if user == request.user and not request.data.get("is_active", True):
            return Response(
                {"detail": "You cannot deactivate your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        changing_role = request.data.get("role") != user.role
        if changing_role and self._is_last_active_admin(user):
            return Response(
                {"detail": LAST_ADMIN_MESSAGE},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._require_admin()
        user = self.get_object()
        if user == request.user:
            return Response(
                {"detail": "You cannot remove your own account here."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if self._is_last_active_admin(user):
            return Response(
                {"detail": LAST_ADMIN_MESSAGE},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)
