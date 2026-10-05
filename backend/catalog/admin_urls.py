from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .admin_views import (
    AdminOverviewView,
    AdminProductViewSet,
    AdminCategoryViewSet,
    AdminBrandViewSet,
    AdminVariantStockView,
    AdminProductImageUploadView,
)
from accounts.admin_views import AdminCustomerViewSet

router = DefaultRouter()
router.register(r"products", AdminProductViewSet, basename="admin-products")
router.register(r"categories", AdminCategoryViewSet, basename="admin-categories")
router.register(r"brands", AdminBrandViewSet, basename="admin-brands")
router.register(r"customers", AdminCustomerViewSet, basename="admin-customers")

urlpatterns = [
    path("overview/", AdminOverviewView.as_view(), name="admin-overview"),
    path(
        "variants/<int:variant_id>/adjust-stock/",
        AdminVariantStockView.as_view(),
        name="admin-variant-adjust-stock",
    ),
    path(
        "products/<int:product_id>/upload-image/",
        AdminProductImageUploadView.as_view(),
        name="admin-product-upload-image",
    ),
    path("", include(router.urls)),
]
