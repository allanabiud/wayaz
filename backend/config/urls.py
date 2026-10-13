from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

from config.views import HealthView

urlpatterns = [
    # Uptime monitor target (kept outside /api/v1/ so version bumps never
    # move it).
    path("api/health/", HealthView.as_view(), name="health"),
    path("admin/", admin.site.urls),
    path("api/v1/admin/", include("catalog.admin_urls")),
    path("api/v1/auth/", include("accounts.urls")),
    path("api/v1/catalog/", include("catalog.urls")),
    path("api/v1/orders/", include("orders.urls")),
    path("api/v1/payments/", include("payments.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
