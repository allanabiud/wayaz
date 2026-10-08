from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .admin_views import (
    AdminOverviewView,
    AdminNavCountsView,
    AdminOrdersView,
    AdminProductViewSet,
    AdminCategoryViewSet,
    AdminProductStockView,
    AdminProductImageUploadView,
    AdminProductImageDetailView,
)
from accounts.admin_views import AdminCustomerViewSet

router = DefaultRouter()
router.register(r"products", AdminProductViewSet, basename="admin-products")
router.register(r"categories", AdminCategoryViewSet, basename="admin-categories")
router.register(r"customers", AdminCustomerViewSet, basename="admin-customers")

urlpatterns = [
    path("overview/", AdminOverviewView.as_view(), name="admin-overview"),
    path("nav-counts/", AdminNavCountsView.as_view(), name="admin-nav-counts"),
    path(
        "orders/",
        AdminOrdersView.as_view(),
        name="admin-orders",
    ),
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
