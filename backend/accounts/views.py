from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .models import Address, WishlistItem
from .serializers import (
    AddressSerializer,
    ChangePasswordSerializer,
    CustomTokenObtainPairSerializer,
    CustomTokenRefreshSerializer,
    ForgotPasswordSerializer,
    RegisterSerializer,
    ResetPasswordSerializer,
    UserSerializer,
    WishlistSerializer,
)

User = get_user_model()


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


class CustomTokenRefreshView(TokenRefreshView):
    serializer_class = CustomTokenRefreshSerializer


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class UserProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class ChangePasswordView(generics.GenericAPIView):
    serializer_class = ChangePasswordSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        # Stamps password_changed_at: every token this user holds outside
        # this request - including any stolen one - dies with the change.
        request.user.change_password(serializer.validated_data["new_password"])
        return Response({"detail": "Password updated successfully."}, status=status.HTTP_200_OK)


class ForgotPasswordView(generics.GenericAPIView):
    """POST /api/v1/auth/forgot-password/ - mail a reset link.

    The response is identical whether or not the address has an account,
    so the endpoint cannot be used to fish for who shops here."""

    serializer_class = ForgotPasswordSerializer
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        user = User.objects.filter(email__iexact=email).first()
        if user is not None:
            uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            reset_url = (
                f"{settings.FRONTEND_URL}/reset-password"
                f"?uidb64={uidb64}&token={token}"
            )
            days = settings.PASSWORD_RESET_TIMEOUT // 86400
            body = (
                f"Hi {user.display_name},\n\n"
                "Someone asked to reset the password for your Wayaz account.\n\n"
                "Open this link to choose a new one:\n"
                f"{reset_url}\n\n"
                f"The link works for {days} days. If you didn't ask for this, "
                "ignore this email - your password stays as it is.\n\n"
                "- Wayaz Collection"
            )
            try:
                send_mail(
                    "Reset your Wayaz password",
                    body,
                    settings.DEFAULT_FROM_EMAIL,
                    [user.email],
                )
            except Exception:
                # Never let delivery trouble reveal whether the account
                # exists; the console backend prints it in development.
                pass

        return Response(
            {"detail": "If that email has an account, a reset link is on its way."},
            status=status.HTTP_200_OK,
        )


class ResetPasswordView(generics.GenericAPIView):
    """POST /api/v1/auth/reset-password/ - exchange a mailed link for a
    new password. Retires every outstanding token via change_password()."""

    serializer_class = ResetPasswordSerializer
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.validated_data["user"].change_password(
            serializer.validated_data["new_password"]
        )
        return Response({"detail": "Password updated. You can sign in now."})


class AddressViewSet(viewsets.ModelViewSet):
    serializer_class = AddressSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)


class WishlistViewSet(viewsets.ModelViewSet):
    serializer_class = WishlistSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            WishlistItem.objects.filter(user=self.request.user)
            .select_related("product", "product__category")
            .prefetch_related("product__images")
        )

    @action(detail=False, methods=["delete"], url_path="remove-product/(?P<product_id>[^/.]+)")
    def remove_by_product_id(self, request, product_id=None):
        deleted, _ = WishlistItem.objects.filter(
            user=request.user, product_id=product_id
        ).delete()
        if deleted:
            return Response(
                {"detail": "Product removed from wishlist."},
                status=status.HTTP_204_NO_CONTENT,
            )
        return Response(
            {"detail": "Product not found in wishlist."},
            status=status.HTTP_404_NOT_FOUND,
        )
