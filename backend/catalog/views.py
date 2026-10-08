from django.db import models
from django.db.models import Q, F, Avg, Count
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Category, Product, ProductReview
from .serializers import (
    CategorySerializer,
    ProductListSerializer,
    ProductDetailSerializer,
    ProductReviewSerializer,
)


def rating_payload(product, user):
    """Rating summary for a product plus the viewer's own rating (if any)."""
    agg = product.reviews.aggregate(avg=Avg("rating"), count=Count("id"))
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
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = "slug"


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = (
        Product.objects.select_related("category")
        .prefetch_related("images")
        .all()
    )
    permission_classes = [permissions.AllowAny]
    lookup_field = "slug"

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
        1-5 star rating; repeating the POST overwrites the caller's rating."""
        product = self.get_object()
        if request.method == "POST":
            serializer = ProductReviewSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            ProductReview.objects.update_or_create(
                product=product,
                user=request.user,
                defaults={"rating": serializer.validated_data["rating"]},
            )
        return Response(rating_payload(product, request.user))

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params

        # Category filter
        category_slug = params.get("category")
        if category_slug:
            qs = qs.filter(category__slug=category_slug)

        # Sale filter
        if params.get("sale") in ("true", "1"):
            qs = qs.filter(sale_price__isnull=False, sale_price__lt=models.F("base_price"))

        # Price range filters
        min_price = params.get("min_price")
        if min_price:
            try:
                qs = qs.filter(base_price__gte=float(min_price))
            except ValueError:
                pass

        max_price = params.get("max_price")
        if max_price:
            try:
                qs = qs.filter(base_price__lte=float(max_price))
            except ValueError:
                pass

        # Text search (title, description, category)
        search_query = params.get("search")
        if search_query:
            qs = qs.filter(
                Q(title__icontains=search_query)
                | Q(description__icontains=search_query)
                | Q(category__name__icontains=search_query)
            )

        # Ordering
        ordering = params.get("ordering")
        if ordering == "price_asc":
            qs = qs.order_by("base_price")
        elif ordering == "price_desc":
            qs = qs.order_by("-base_price")
        elif ordering == "newest":
            qs = qs.order_by("-created_at")
        elif ordering == "title":
            qs = qs.order_by("title")

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
