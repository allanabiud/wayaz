from django.db import models
from django.db.models import Q, F, Avg, Count, Case, DecimalField, When
from rest_framework import viewsets, permissions, generics, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.throttling import ScopedRateThrottle
from drf_spectacular.utils import extend_schema

from .models import (
    Category,
    ContactMessage,
    Product,
    ProductReview,
    RestockNotification,
    StoreSettings,
)
from .serializers import (
    CategorySerializer,
    ContactMessageCreateSerializer,
    ProductListSerializer,
    ProductDetailSerializer,
    ProductReviewListSerializer,
    ProductReviewSerializer,
    RestockNotificationCreateSerializer,
    StoreSettingsSerializer,
)

# What the shopper actually pays: the sale price while a sale is live,
# otherwise the base price. Filtering and sorting on this rather than
# base_price keeps sale items correct - a Ksh 3,000 sale piece has to show
# up under "up to Ksh 4,000" and sort before a Ksh 4,000 full-price one.
EFFECTIVE_PRICE = Case(
    When(sale_price__isnull=False, sale_price__lt=F("base_price"), then=F("sale_price")),
    default=F("base_price"),
    output_field=DecimalField(max_digits=10, decimal_places=2),
)


def rating_payload(product, user):
    """Rating summary for a product plus the viewer's own rating (if any).

    Hidden (unapproved) reviews are excluded from the aggregate but a viewer
    still sees the rating they personally left."""
    agg = product.reviews.filter(is_approved=True).aggregate(
        avg=Avg("rating"), count=Count("id")
    )
    user_rating = None
    if user is not None and user.is_authenticated:
        user_rating = (
            product.reviews.filter(user=user)
            .values_list("rating", flat=True)
            .first()
        )
    return {
        "average_rating": round(agg["avg"], 1) if agg["count"] else None,
        "rating_count": agg["count"],
        "user_rating": user_rating,
    }


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    # Explicit order_by: the annotate() below puts this in GROUP BY mode,
    # where Django's Meta.ordering no longer counts as an ordering (rows
    # would paginate in arbitrary DB order and trigger DRF's
    # UnorderedObjectListWarning). Mirrors Category.Meta.ordering.
    queryset = (
        Category.objects.annotate(product_count=Count("products"))
        .order_by("display_order", "name")
        .all()
    )
    serializer_class = CategorySerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = "slug"

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        # 5 minutes browser/edge caching with stale-while-revalidate for snappy storefront loads
        response["Cache-Control"] = "public, max-age=60, s-maxage=300, stale-while-revalidate=600"
        return response

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        response["Cache-Control"] = "public, max-age=60, s-maxage=300, stale-while-revalidate=600"
        return response


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = (
        Product.objects.select_related("category")
        .prefetch_related("images")
        .all()
    )
    permission_classes = [permissions.AllowAny]
    lookup_field = "slug"

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        # Products list caching (1 min fresh, 5 min edge)
        response["Cache-Control"] = "public, max-age=60, s-maxage=300, stale-while-revalidate=600"
        return response

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        # Anonymous product details can be cached, authenticated requests vary
        if not request.user.is_authenticated:
            response["Cache-Control"] = "public, max-age=60, s-maxage=300, stale-while-revalidate=600"
        else:
            response["Cache-Control"] = "private, no-cache"
        return response

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ProductDetailSerializer
        return ProductListSerializer

    def get_permissions(self):
        # Reading ratings is public; submitting one requires an account.
        if self.action == "review" and self.request.method == "POST":
            return [permissions.IsAuthenticated()]
        return super().get_permissions()

    def get_object(self):
        obj = super().get_object()
        if self.action == "retrieve":
            payload = rating_payload(obj, self.request.user)
            obj.average_rating = payload["average_rating"]
            obj.rating_count = payload["rating_count"]
            obj.user_rating = payload["user_rating"]
        return obj

    @action(detail=True, methods=["get", "post"], url_path="review")
    def review(self, request, slug=None):
        """GET the rating summary (incl. the caller's own rating) or POST a
        1-5 star rating plus an optional written comment; repeating the POST
        overwrites the caller's review. A payload without `comment` leaves
        any existing comment alone - the PDP's quick star row sends only the
        rating, so tapping a star can never wipe written feedback."""
        product = self.get_object()
        if request.method == "POST":
            serializer = ProductReviewSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            defaults = {"rating": serializer.validated_data["rating"]}
            if "comment" in serializer.validated_data:
                defaults["comment"] = serializer.validated_data["comment"]
            # New rows pick up is_approved=True (auto-publish); an existing
            # hidden review stays hidden - re-approving is the staff's call.
            ProductReview.objects.update_or_create(
                product=product,
                user=request.user,
                defaults=defaults,
            )
        return Response(rating_payload(product, request.user))

    @action(detail=True, methods=["get"], url_path="reviews")
    def reviews(self, request, slug=None):
        """Approved reviews for this product, newest first."""
        product = self.get_object()
        qs = product.reviews.filter(is_approved=True).select_related("user")
        page = self.paginate_queryset(qs)
        serializer = ProductReviewListSerializer(
            page, many=True, context={"request": request}
        )
        return self.get_paginated_response(serializer.data)

    def get_queryset(self):
        qs = super().get_queryset().annotate(effective_price=EFFECTIVE_PRICE)
        params = self.request.query_params

        category_slug = params.get("category")
        if category_slug:
            qs = qs.filter(category__slug=category_slug)

        if params.get("sale") in ("true", "1"):
            qs = qs.filter(sale_price__isnull=False, sale_price__lt=models.F("base_price"))

        min_price = params.get("min_price")
        if min_price:
            try:
                qs = qs.filter(effective_price__gte=float(min_price))
            except ValueError:
                pass

        max_price = params.get("max_price")
        if max_price:
            try:
                qs = qs.filter(effective_price__lte=float(max_price))
            except ValueError:
                pass

        search_query = params.get("search")
        if search_query:
            qs = qs.filter(
                Q(title__icontains=search_query)
                | Q(description__icontains=search_query)
                | Q(category__name__icontains=search_query)
            )

        ordering = params.get("ordering")
        # `-created_at` rides along as a tiebreaker so pages stay stable when
        # several products share a price.
        if ordering == "price_asc":
            qs = qs.order_by("effective_price", "-created_at")
        elif ordering == "price_desc":
            qs = qs.order_by("-effective_price", "-created_at")
        elif ordering == "newest":
            qs = qs.order_by("-created_at")
        elif ordering == "title":
            qs = qs.order_by("title", "-created_at")

        return qs

    @action(detail=False, methods=["get"], url_path="search-suggestions")
    def search_suggestions(self, request):
        query = request.query_params.get("q", "").strip()
        if not query or len(query) < 2:
            # Suggest newest products and top-level categories
            trending_products = Product.objects.all().prefetch_related("images")[:6]
            popular_categories = Category.objects.all()[:6]
            return Response(
                {
                    "products": [
                    {
                            "id": p.id,
                            "title": p.title,
                            "slug": p.slug,
                            "price": str(p.current_price),
                            "thumbnail": request.build_absolute_uri(p.primary_image.image.url)
                            if p.primary_image and p.primary_image.image
                            else None,
                        }
                        for p in trending_products
                    ],
                    "categories": [
                        {"name": c.name, "slug": c.slug} for c in popular_categories
                    ],
                }
            )

        matching_products = (
            Product.objects.filter(
                Q(title__icontains=query)
                | Q(category__name__icontains=query)
            )
            .prefetch_related("images")[:8]
        )

        matching_categories = Category.objects.filter(
            name__icontains=query
        )[:4]

        return Response(
            {
                "products": [
                    {
                        "id": p.id,
                        "title": p.title,
                        "slug": p.slug,
                        "price": str(p.current_price),
                        "thumbnail": request.build_absolute_uri(p.primary_image.image.url)
                        if p.primary_image and p.primary_image.image
                        else None,
                    }
                    for p in matching_products
                ],
                "categories": [
                    {"name": c.name, "slug": c.slug} for c in matching_categories
                ],
            }
        )


class StoreSettingsView(APIView):
    """Public store settings (branding, socials, WhatsApp number, announcement)."""

    permission_classes = [permissions.AllowAny]
    serializer_class = StoreSettingsSerializer

    @extend_schema(
        summary="Retrieve public store settings",
        responses={200: StoreSettingsSerializer},
    )
    def get(self, request):
        settings = StoreSettings.load()
        serializer = StoreSettingsSerializer(settings, context={"request": request})
        return Response(serializer.data)


class RestockNotificationCreateView(generics.CreateAPIView):
    """Public opt-in: "tell me when this piece is back."

    Subscribing twice is a no-op (200) instead of an error, so a shopper can
    tap the button again after a page refresh without seeing a failure."""

    queryset = RestockNotification.objects.all()
    serializer_class = RestockNotificationCreateSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    # Own scope: the contact-form tests share the "contact" counter and a
    # full-suite run would drain it, 429-ing an unrelated test.
    throttle_scope = "restock-notifications"

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        product = serializer.validated_data["product"]
        if product.is_in_stock:
            # Something restocked before they got here - no point on the list.
            return Response(
                {"detail": "This piece is already back in stock."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = serializer.validated_data["email"]
        _, created = RestockNotification.objects.get_or_create(
            product=product,
            email=email,
            defaults={"phone": serializer.validated_data.get("phone", "")},
        )
        return Response(
            serializer.data if created else {"detail": "Already on the list."},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ContactMessageCreateView(generics.CreateAPIView):
    """Public customer contact submission."""

    queryset = ContactMessage.objects.all()
    serializer_class = ContactMessageCreateSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "contact"

    def perform_create(self, serializer):
        msg = serializer.save()
        from orders.emails import _send
        from django.conf import settings

        merchant_email = getattr(settings, "MANAGER_EMAIL", "")
        if merchant_email:
            subject = f"New Contact Message: {msg.subject}"
            body = (
                f"You received a new inquiry via the website contact form:\n\n"
                f"From: {msg.name} <{msg.email}>\n"
                f"Phone: {msg.phone or 'Not provided'}\n"
                f"Subject: {msg.subject}\n\n"
                f"Message:\n{msg.message}\n\n"
                f"Received at: {msg.created_at.strftime('%Y-%m-%d %H:%M:%S')}\n"
            )
            _send(subject, body, [merchant_email])

