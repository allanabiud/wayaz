from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ChangePasswordView,
    CustomTokenObtainPairView,
    CustomTokenRefreshView,
    ForgotPasswordView,
    RegisterView,
    ResetPasswordView,
    UserProfileView,
    AddressViewSet,
    WishlistViewSet,
)

router = DefaultRouter()
router.register(r"addresses", AddressViewSet, basename="address")
router.register(r"wishlist", WishlistViewSet, basename="wishlist")

urlpatterns = [
    path("token/", CustomTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", CustomTokenRefreshView.as_view(), name="token_refresh"),
    path("register/", RegisterView.as_view(), name="register"),
    path("me/", UserProfileView.as_view(), name="user_profile"),
    path("change-password/", ChangePasswordView.as_view(), name="change_password"),
    path(
        "forgot-password/",
        ForgotPasswordView.as_view(),
        name="forgot_password",
    ),
    path(
        "reset-password/",
        ResetPasswordView.as_view(),
        name="reset_password",
    ),
    path("", include(router.urls)),
]
