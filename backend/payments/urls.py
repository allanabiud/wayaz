from django.urls import path
from .views import (
    STKPushInitiateView,
    STKPushStatusView,
    STKPushMockSimulateView,
    DarajaCallbackView,
)

urlpatterns = [
    path("mpesa/stk-push/", STKPushInitiateView.as_view(), name="mpesa-stk-push"),
    path("mpesa/callback/", DarajaCallbackView.as_view(), name="mpesa-callback"),
    path("status/<str:checkout_request_id>/", STKPushStatusView.as_view(), name="payment-status"),
    path("mock-simulate/", STKPushMockSimulateView.as_view(), name="mock-simulate"),
]
