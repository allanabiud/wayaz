from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from config.views import HealthView

urlpatterns = [
    # Uptime monitor target, kept outside /api/v1/ so version bumps never
    # move it; /health and /health/ are aliases many monitors default to.
    path("api/health/", HealthView.as_view(), name="health"),
    path("health/", HealthView.as_view(), name="health-alias"),
    path("health", HealthView.as_view(), name="health-alias-bare"),
    path("admin/", admin.site.urls),
    path("api/v1/admin/", include("catalog.admin_urls")),
    path("api/v1/auth/", include("accounts.urls")),
    path("api/v1/catalog/", include("catalog.urls")),
    path("api/v1/orders/", include("orders.urls")),
    path("api/v1/payments/", include("payments.urls")),
]

# OpenAPI 3 schema & interactive docs, gated off in production
# (SERVE_DOCS follows DEBUG) so the public API surface stays undiscoverable.
if settings.SERVE_DOCS:
    urlpatterns += [
        path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
        path(
            "api/v1/schema/swagger-ui/",
            SpectacularSwaggerView.as_view(url_name="schema"),
            name="swagger-ui",
        ),
        path(
            "api/v1/schema/redoc/",
            SpectacularRedocView.as_view(url_name="schema"),
            name="redoc",
        ),
    ]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
