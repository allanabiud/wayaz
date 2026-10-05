from django.contrib.auth import get_user_model
from django.db.models import Q, F, Sum
from rest_framework import status, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from accounts.permissions import IsStaffOrAdminUser
from .models import Category, Brand, Product, ProductImage, ProductVariant
from .serializers import CategorySerializer, BrandSerializer
from .admin_serializers import AdminProductSerializer, AdminVariantSerializer

User = get_user_model()


class AdminOverviewView(APIView):
    permission_classes = [IsStaffOrAdminUser]

    def get(self, request):
        total_products = Product.objects.count()
        total_variants = ProductVariant.objects.count()
        total_stock = ProductVariant.objects.aggregate(total=Sum("stock_quantity"))["total"] or 0

        # Out of stock and low stock items
        out_of_stock_variants = ProductVariant.objects.filter(stock_quantity=0)
        low_stock_variants = (
            ProductVariant.objects.filter(stock_quantity__gt=0, stock_quantity__lte=5)
            .select_related("product")[:10]
        )

        total_categories = Category.objects.count()
        total_brands = Brand.objects.count()
        total_customers = User.objects.filter(role="customer").count()

        return Response(
            {
                "kpis": {
                    "total_products": total_products,
                    "total_variants": total_variants,
                    "total_stock_units": total_stock,
                    "out_of_stock_count": out_of_stock_variants.count(),
                    "total_categories": total_categories,
                    "total_brands": total_brands,
                    "total_customers": total_customers,
                },
                "low_stock_alerts": [
                    {
                        "variant_id": v.id,
                        "product_title": v.product.title,
                        "sku": v.sku,
                        "color": v.color_name,
                        "size": v.size,
                        "stock_quantity": v.stock_quantity,
                    }
                    for v in low_stock_variants
                ],
            }
        )


class AdminProductViewSet(viewsets.ModelViewSet):
    queryset = (
        Product.objects.select_related("category", "brand")
        .prefetch_related("images", "variants")
        .all()
    )
    serializer_class = AdminProductSerializer
    permission_classes = [IsStaffOrAdminUser]
    lookup_field = "id"

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params

        search = params.get("search")
        if search:
            qs = qs.filter(
                Q(title__icontains=search)
                | Q(variants__sku__icontains=search)
                | Q(category__name__icontains=search)
                | Q(brand__name__icontains=search)
            ).distinct()

        category = params.get("category")
        if category:
            qs = qs.filter(category_id=category)

        brand = params.get("brand")
        if brand:
            qs = qs.filter(brand_id=brand)

        in_stock = params.get("in_stock")
        if in_stock in ("true", "1"):
            qs = qs.filter(variants__stock_quantity__gt=0).distinct()
        elif in_stock in ("false", "0"):
            qs = qs.filter(variants__stock_quantity=0).distinct()

        return qs


class AdminCategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsStaffOrAdminUser]
    lookup_field = "id"


class AdminBrandViewSet(viewsets.ModelViewSet):
    queryset = Brand.objects.all()
    serializer_class = BrandSerializer
    permission_classes = [IsStaffOrAdminUser]
    lookup_field = "id"


class AdminVariantStockView(APIView):
    permission_classes = [IsStaffOrAdminUser]

    def post(self, request, variant_id):
        try:
            variant = ProductVariant.objects.get(id=variant_id)
        except ProductVariant.DoesNotExist:
            return Response(
                {"detail": "Variant not found."}, status=status.HTTP_404_NOT_FOUND
            )

        new_stock = request.data.get("stock_quantity")
        adjustment = request.data.get("adjustment")

        if new_stock is not None:
            try:
                variant.stock_quantity = max(0, int(new_stock))
            except ValueError:
                return Response(
                    {"detail": "Invalid stock quantity."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        elif adjustment is not None:
            try:
                variant.stock_quantity = max(0, variant.stock_quantity + int(adjustment))
            except ValueError:
                return Response(
                    {"detail": "Invalid adjustment number."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            return Response(
                {"detail": "Provide either 'stock_quantity' or 'adjustment'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        variant.save()
        return Response(AdminVariantSerializer(variant).data)


class AdminProductImageUploadView(APIView):
    permission_classes = [IsStaffOrAdminUser]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, product_id):
        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return Response(
                {"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND
            )

        image_file = request.FILES.get("image")
        if not image_file:
            return Response(
                {"detail": "No image file provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        is_primary = request.data.get("is_primary", "false").lower() in ("true", "1")
        alt_text = request.data.get("alt_text", product.title)
        display_order = int(request.data.get("display_order", 0))

        image = ProductImage.objects.create(
            product=product,
            image=image_file,
            alt_text=alt_text,
            is_primary=is_primary,
            display_order=display_order,
        )

        return Response(
            {
                "id": image.id,
                "url": request.build_absolute_uri(image.image.url),
                "is_primary": image.is_primary,
                "display_order": image.display_order,
            },
            status=status.HTTP_201_CREATED,
        )
