from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import Address, WishlistItem
from .serializers import (
    AddressSerializer,
    CustomTokenObtainPairSerializer,
    RegisterSerializer,
    UserSerializer,
    WishlistSerializer,
)


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class UserProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class AddressViewSet(viewsets.ModelViewSet):
    serializer_class = AddressSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)


class WishlistViewSet(viewsets.ModelViewSet):
    serializer_class = WishlistSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            WishlistItem.objects.filter(user=self.request.user)
            .select_related("product", "product__category")
            .prefetch_related("product__images")
        )

    @action(detail=False, methods=["delete"], url_path="remove-product/(?P<product_id>[^/.]+)")
    def remove_by_product_id(self, request, product_id=None):
        deleted, _ = WishlistItem.objects.filter(
            user=request.user, product_id=product_id
        ).delete()
        if deleted:
            return Response(
                {"detail": "Product removed from wishlist."},
                status=status.HTTP_204_NO_CONTENT,
            )
        return Response(
            {"detail": "Product not found in wishlist."},
            status=status.HTTP_404_NOT_FOUND,
        )
