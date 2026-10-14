from django.urls import path
from rest_framework.routers import SimpleRouter

from .admin_views import (
    AdminCouponViewSet,
    AdminOrderDetailView,
    AdminOrdersView,
    AdminPaymentsView,
)

router = SimpleRouter()
router.register(r"coupons", AdminCouponViewSet, basename="admin-coupons")

urlpatterns = [
    # The router must come first: the order-detail pattern below would
    # otherwise swallow "coupons/" as an order_number.
    *router.urls,
    path("payments/", AdminPaymentsView.as_view(), name="admin-payments"),
    path("", AdminOrdersView.as_view(), name="admin-orders"),
    path(
        "<str:order_number>/",
        AdminOrderDetailView.as_view(),
        name="admin-order-detail",
    ),
]
