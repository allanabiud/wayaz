import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiTypes,
    extend_schema,
    extend_schema_view,
    inline_serializer,
)
from rest_framework import generics, permissions, serializers, status, viewsets
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

logger = logging.getLogger(__name__)


@extend_schema(
    summary="Sign in and obtain a JWT pair",
    description=(
        "Accepts the username or the account's email address. The response "
        "carries the access/refresh pair plus a snapshot of the user, so the "
        "client can hydrate its session without a second round trip."
    ),
    request=CustomTokenObtainPairSerializer,
    responses={
        200: inline_serializer(
            name="TokenObtainPairResponse",
            fields={
                "access": serializers.CharField(
                    help_text="Short-lived token for Authorization: Bearer."
                ),
                "refresh": serializers.CharField(
                    help_text="Long-lived token used to mint a new access token."
                ),
                "user": inline_serializer(
                    name="SessionUser",
                    fields={
                        "id": serializers.IntegerField(),
                        "username": serializers.CharField(),
                        "email": serializers.CharField(),
                        "phone_number": serializers.CharField(allow_blank=True),
                        "role": serializers.CharField(),
                        "display_name": serializers.CharField(),
                        "is_staff": serializers.BooleanField(),
                        "is_superuser": serializers.BooleanField(),
                    },
                ),
            },
        ),
    },
)
class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    throttle_scope = "auth"


@extend_schema(
    summary="Refresh the access token",
    description=(
        "Trade a valid refresh token for a fresh access token. Refresh tokens "
        "minted before the last password change are rejected."
    ),
    request=CustomTokenRefreshSerializer,
    responses={
        200: inline_serializer(
            name="TokenRefreshResponse",
            fields={"access": serializers.CharField()},
        ),
    },
)
class CustomTokenRefreshView(TokenRefreshView):
    serializer_class = CustomTokenRefreshSerializer
    throttle_scope = "auth"


@extend_schema(
    summary="Create a customer account",
    description="The account is ready for sign-in immediately; no verification email is sent.",
)
class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth"


@extend_schema(
    summary="Get or update the current user's profile",
    description="GET returns the signed-in user; PATCH/PUT update the writable profile fields.",
)
class UserProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


@extend_schema(
    summary="Change the current user's password",
    description=(
        "On success every refresh token the user holds outside this request "
        "dies with the change (password_changed_at stamp)."
    ),
    request=ChangePasswordSerializer,
    responses={
        200: inline_serializer(
            name="ChangePasswordResponse",
            fields={"detail": serializers.CharField()},
        ),
    },
)
class ChangePasswordView(generics.GenericAPIView):
    serializer_class = ChangePasswordSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        # Stamps password_changed_at: every token this user holds outside
        # this request - including any stolen one - dies with the change.
        request.user.change_password(serializer.validated_data["new_password"])
        return Response(
            {"detail": "Password updated successfully."}, status=status.HTTP_200_OK
        )


@extend_schema(
    summary="Request a password-reset link",
    description=(
        "Always answers with the same message whether or not the address has "
        "an account, so the endpoint cannot be used to fish for who shops here."
    ),
    request=ForgotPasswordSerializer,
    responses={
        200: inline_serializer(
            name="ForgotPasswordResponse",
            fields={"detail": serializers.CharField()},
        ),
    },
)
class ForgotPasswordView(generics.GenericAPIView):
    """Mail a reset link. The response is identical whether or not the
    address has an account, so it cannot fish for who shops here."""

    serializer_class = ForgotPasswordSerializer
    permission_classes = [permissions.AllowAny]
    # Each hit mails a message: an email-bomb and enumeration surface.
    throttle_scope = "forgot-password"

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        user = User.objects.filter(email__iexact=email).first()
        if user is not None:
            uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            reset_url = (
                f"{settings.FRONTEND_URL}/reset-password?uidb64={uidb64}&token={token}"
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
                from catalog.models import StoreSettings

                store = StoreSettings.load()
            except Exception:  # noqa: BLE001
                store = None

            frontend_url = settings.FRONTEND_URL.rstrip("/")
            logo_url = None
            if store and store.logo:
                try:
                    path = store.logo.url
                    logo_url = (
                        path
                        if (path.startswith("http://") or path.startswith("https://"))
                        else f"{frontend_url}/{path.lstrip('/')}"
                    )
                except Exception:  # noqa: BLE001
                    logo_url = None
            if not logo_url:
                logo_url = f"{frontend_url}/wayaz_logo.jpeg"

            try:
                html_body = render_to_string(
                    "emails/password_reset.html",
                    {
                        "user": user,
                        "store": store,
                        "logo_url": logo_url,
                        "frontend_url": frontend_url,
                        "reset_url": reset_url,
                        "days": days,
                    },
                )
            except Exception:  # noqa: BLE001
                logger.exception("Failed to render password reset HTML")
                html_body = None

            try:
                msg = EmailMultiAlternatives(
                    "Reset your Wayaz password",
                    body,
                    settings.DEFAULT_FROM_EMAIL,
                    [user.email],
                )
                if html_body:
                    msg.attach_alternative(html_body, "text/html")
                msg.send(fail_silently=False)
            except Exception:  # noqa: BLE001 - response must not reveal existence
                # Never let delivery trouble reveal whether the account
                # exists; the console backend prints it in development.
                logger.exception(
                    "Failed to send password reset email to %s", user.email
                )

        return Response(
            {"detail": "If that email has an account, a reset link is on its way."},
            status=status.HTTP_200_OK,
        )


@extend_schema(
    summary="Complete a password reset",
    description=(
        "Exchange the emailed uidb64 + token for a new password. Retires "
        "every outstanding token via change_password()."
    ),
    request=ResetPasswordSerializer,
    responses={
        200: inline_serializer(
            name="ResetPasswordResponse",
            fields={"detail": serializers.CharField()},
        ),
    },
)
class ResetPasswordView(generics.GenericAPIView):
    """Exchange a mailed link for a new password. Retires every outstanding
    token via change_password()."""

    serializer_class = ResetPasswordSerializer
    permission_classes = [permissions.AllowAny]
    # Reset links are single-use signed tokens; the tight scope also slows
    # brute force.
    throttle_scope = "forgot-password"

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.validated_data["user"].change_password(
            serializer.validated_data["new_password"]
        )
        return Response({"detail": "Password updated. You can sign in now."})


_ADDRESS_ID_PARAM = extend_schema(
    parameters=[
        OpenApiParameter(
            "id", OpenApiTypes.INT, location="path", description="Address id."
        )
    ]
)


@extend_schema_view(
    retrieve=_ADDRESS_ID_PARAM,
    update=_ADDRESS_ID_PARAM,
    partial_update=_ADDRESS_ID_PARAM,
    destroy=_ADDRESS_ID_PARAM,
)
class AddressViewSet(viewsets.ModelViewSet):
    serializer_class = AddressSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)


_WISHLIST_ID_PARAM = extend_schema(
    parameters=[
        OpenApiParameter(
            "id", OpenApiTypes.INT, location="path", description="Wishlist entry id."
        )
    ]
)


@extend_schema_view(
    retrieve=_WISHLIST_ID_PARAM,
    update=_WISHLIST_ID_PARAM,
    partial_update=_WISHLIST_ID_PARAM,
    destroy=_WISHLIST_ID_PARAM,
)
class WishlistViewSet(viewsets.ModelViewSet):
    serializer_class = WishlistSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            WishlistItem.objects.filter(user=self.request.user)
            .select_related("product", "product__category")
            .prefetch_related("product__images")
        )

    @extend_schema(
        summary="Remove a product from the wishlist",
        description="Answers 204 whether or not the product was present; a product never in the wishlist 404s.",
        parameters=[
            OpenApiParameter(
                "product_id",
                OpenApiTypes.INT,
                location="path",
                description="Product id.",
            )
        ],
        responses={
            204: None,
            404: inline_serializer(
                name="WishlistRemoveNotFound",
                fields={"detail": serializers.CharField()},
            ),
        },
    )
    @action(
        detail=False,
        methods=["delete"],
        url_path="remove-product/(?P<product_id>[^/.]+)",
    )
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
