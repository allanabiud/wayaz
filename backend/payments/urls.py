from django.urls import path
from .views import (
    STKPushInitiateView,
    STKPushStatusView,
    STKPushMockSimulateView,
    DarajaCallbackView,
)

urlpatterns = [
    path("mpesa/stk-push/", STKPushInitiateView.as_view(), name="mpesa-stk-push"),
    # The callback URL given to Safaricom embeds the shared secret
    # (MPESA_CALLBACK_URL must end in /<secret>/); the view rejects
    # anything else in constant time.
    path(
        "mpesa/callback/<str:token>/",
        DarajaCallbackView.as_view(),
        name="mpesa-callback",
    ),
    path("status/<str:checkout_request_id>/", STKPushStatusView.as_view(), name="payment-status"),
    # Mock payment simulator. The view 404s unless MPESA_ENVIRONMENT is
    # "mock", so the fake-payment endpoint is dead code in sandbox and
    # production even though the route stays resolvable for local tooling.
    path(
        "mock-simulate/",
        STKPushMockSimulateView.as_view(),
        name="mock-simulate",
    ),
]
