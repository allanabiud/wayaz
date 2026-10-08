from django.db import models
from django.db.models import Q, F
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Category, Product
from .serializers import (
    CategorySerializer,
    ProductListSerializer,
    ProductDetailSerializer,
)


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
