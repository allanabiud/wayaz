from django.urls import path
from .views import (
    CartDetailView,
    CartItemAddView,
    CartItemDetailView,
    CartMergeView,
    CheckoutView,
    OrderListView,
)

urlpatterns = [
    path("", OrderListView.as_view(), name="order-list"),
    path("cart/", CartDetailView.as_view(), name="cart-detail"),
    path("cart/items/", CartItemAddView.as_view(), name="cart-item-add"),
    path("cart/items/<int:item_id>/", CartItemDetailView.as_view(), name="cart-item-detail"),
    path("cart/merge/", CartMergeView.as_view(), name="cart-merge"),
    path("checkout/", CheckoutView.as_view(), name="checkout"),
]
