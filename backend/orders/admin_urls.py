from django.urls import path
from .admin_views import AdminOrdersView, AdminOrderDetailView

urlpatterns = [
    path("", AdminOrdersView.as_view(), name="admin-orders"),
    path("<str:order_number>/", AdminOrderDetailView.as_view(), name="admin-order-detail"),
]
