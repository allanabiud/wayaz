from datetime import datetime, timezone as dt_timezone

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework_simplejwt.serializers import (
    TokenObtainPairSerializer,
    TokenRefreshSerializer,
)
from rest_framework_simplejwt.settings import api_settings as jwt_settings
from rest_framework_simplejwt.tokens import UntypedToken

from catalog.serializers import ProductListSerializer

from .models import Address, WishlistItem

User = get_user_model()

SESSION_EXPIRED_MESSAGE = (
    "Session expired after a password change. Please sign in again."
)


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        username_or_email = attrs.get(self.username_field)
        if username_or_email:
            # If input contains an '@' or doesn't match an existing username, check if it matches an email
            user_by_email = User.objects.filter(email__iexact=username_or_email).first()
            if user_by_email:
                attrs[self.username_field] = user_by_email.get_username()

        data = super().validate(attrs)
        data["user"] = {
            "id": self.user.id,
            "username": self.user.username,
            "email": self.user.email,
            "phone_number": self.user.phone_number or "",
            "role": self.user.role,
            "display_name": self.user.display_name,
            "is_staff": self.user.is_staff,
            "is_superuser": self.user.is_superuser,
        }
        return data


class ForgotPasswordSerializer(serializers.Serializer):
    """Input for the reset-link mailer; the view decides what to send."""

    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    """The mailed link's uidb64 + token, plus the password to set.

    The user is resolved here so the view never touches request data
    directly; an unknown or tampered link fails validation like any other
    bad input."""

    uidb64 = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(validators=[validate_password])

    def validate(self, attrs):
        try:
            user_id = force_str(urlsafe_base64_decode(attrs["uidb64"]))
            user = User.objects.get(pk=user_id)
        except (ValueError, TypeError, OverflowError, User.DoesNotExist):
            raise serializers.ValidationError(
                {"detail": "That reset link is not valid."}
            )

        if not default_token_generator.check_token(user, attrs["token"]):
            # Covers wrong, expired, and already-used links alike: the
            # token embeds the password hash, so a used link dies here.
            raise serializers.ValidationError(
                {"detail": "That reset link is not valid or has expired."}
            )

        attrs["user"] = user
        return attrs


class CustomTokenRefreshSerializer(TokenRefreshSerializer):
    """A refresh token minted before the password changed cannot be
    traded for a new access token.

    The check runs against the incoming (old) refresh token's issue time;
    new tokens obtained after signing in again are untouched."""

    def validate(self, attrs):
        data = super().validate(attrs)

        # super() already verified signature, expiry and token type, so
        # this decode cannot fail; we only need the old claims back.
        claims = UntypedToken(attrs["refresh"]).payload
        user_id = claims.get(jwt_settings.USER_ID_CLAIM)
        issued_at = claims.get("iat")
        if user_id is not None and issued_at is not None:
            user = User.objects.filter(pk=user_id).only("password_changed_at").first()
            changed = user.password_changed_at if user else None
            if changed is not None:
                minted = datetime.fromtimestamp(issued_at, tz=dt_timezone.utc)
                if minted < changed:
                    raise serializers.ValidationError(
                        {"detail": SESSION_EXPIRED_MESSAGE}
                    )
        return data


class UserSerializer(serializers.ModelSerializer):
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
        )
        read_only_fields = ("id", "role")


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, validators=[validate_password])

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Incorrect current password.")
        return value


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True, required=True, validators=[validate_password]
    )

    class Meta:
        model = User
        fields = (
            "username",
            "email",
            "password",
            "first_name",
            "last_name",
            "phone_number",
        )

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
            phone_number=validated_data.get("phone_number", ""),
            role=User.Role.CUSTOMER,
        )
        return user


class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = (
            "id",
            "full_name",
            "phone_number",
            "county",
            "town",
            "street_address",
            "is_default",
            "created_at",
        )
        read_only_fields = ("id", "created_at")

    def create(self, validated_data):
        validated_data["user"] = self.context["request"].user
        return super().create(validated_data)


class WishlistSerializer(serializers.ModelSerializer):
    product = ProductListSerializer(read_only=True)
    product_id = serializers.IntegerField(write_only=True)

    class Meta:
        model = WishlistItem
        fields = ("id", "product", "product_id", "added_at")
        read_only_fields = ("id", "added_at")

    def create(self, validated_data):
        user = self.context["request"].user
        product_id = validated_data["product_id"]
        item, _ = WishlistItem.objects.get_or_create(user=user, product_id=product_id)
        return item
