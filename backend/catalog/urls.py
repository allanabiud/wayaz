from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CategoryViewSet,
    ContactMessageCreateView,
    ProductViewSet,
    RestockNotificationCreateView,
    StoreSettingsView,
)

router = DefaultRouter()
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"products", ProductViewSet, basename="product")

urlpatterns = [
    path("settings/", StoreSettingsView.as_view(), name="store-settings"),
    path("contact/", ContactMessageCreateView.as_view(), name="contact-message-create"),
    path(
        "restock-notifications/",
        RestockNotificationCreateView.as_view(),
        name="restock-notification-create",
    ),
    path("", include(router.urls)),
]
