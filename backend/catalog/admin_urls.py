from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .admin_views import (
    AdminOverviewView,
    AdminAnalyticsView,
    AdminNavCountsView,
    AdminProductViewSet,
    AdminCategoryViewSet,
    AdminReviewViewSet,
    AdminProductStockView,
    AdminProductImageUploadView,
    AdminProductImageDetailView,
    AdminStoreSettingsView,
    AdminMpesaConfigView,
)
from accounts.admin_views import AdminCustomerViewSet, AdminTeamViewSet

router = DefaultRouter()
router.register(r"products", AdminProductViewSet, basename="admin-products")
router.register(r"categories", AdminCategoryViewSet, basename="admin-categories")
router.register(r"reviews", AdminReviewViewSet, basename="admin-reviews")
router.register(r"customers", AdminCustomerViewSet, basename="admin-customers")
router.register(r"team", AdminTeamViewSet, basename="admin-team")

urlpatterns = [
    path("overview/", AdminOverviewView.as_view(), name="admin-overview"),
    path("analytics/", AdminAnalyticsView.as_view(), name="admin-analytics"),
    path("nav-counts/", AdminNavCountsView.as_view(), name="admin-nav-counts"),
    path("settings/", AdminStoreSettingsView.as_view(), name="admin-store-settings"),
    path("mpesa-config/", AdminMpesaConfigView.as_view(), name="admin-mpesa-config"),
    path("orders/", include("orders.admin_urls")),
    path(
        "products/<int:product_id>/adjust-stock/",
        AdminProductStockView.as_view(),
        name="admin-product-adjust-stock",
    ),
    path(
        "products/<int:product_id>/upload-image/",
        AdminProductImageUploadView.as_view(),
        name="admin-product-upload-image",
    ),
    path(
        "products/<int:product_id>/images/<int:image_id>/",
        AdminProductImageDetailView.as_view(),
        name="admin-product-image-detail",
    ),
    path("", include(router.urls)),
]
