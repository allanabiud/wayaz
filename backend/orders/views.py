import uuid
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response

from catalog.models import Product
from .models import Cart, CartItem
from .serializers import (
    CartSerializer,
    AddToCartSerializer,
    UpdateCartItemSerializer,
    MergeCartSerializer,
)


def get_or_create_cart(request):
    """
    Resolves the cart for both authenticated users and anonymous guest shoppers.
    Anonymous guests provide an X-Cart-ID header or cart_id query parameter.
    """
    if request.user.is_authenticated:
        cart, _ = Cart.objects.get_or_create(user=request.user)
        return cart

    cart_id_str = request.headers.get("X-Cart-ID") or request.query_params.get("cart_id")

    if cart_id_str:
        try:
            cart_uuid = uuid.UUID(cart_id_str)
            cart = Cart.objects.filter(id=cart_uuid, user__isnull=True).first()
            if cart:
                return cart
        except (ValueError, AttributeError):
            pass

    return Cart.objects.create()


class CartDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        cart = get_or_create_cart(request)
        serializer = CartSerializer(cart, context={"request": request})
        response = Response(serializer.data)
        response["X-Cart-ID"] = str(cart.id)
        return response

    def delete(self, request):
        cart = get_or_create_cart(request)
        cart.items.all().delete()
        serializer = CartSerializer(cart, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class CartItemAddView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = AddToCartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        product_id = serializer.validated_data["product_id"]
        quantity = serializer.validated_data["quantity"]
        size = serializer.validated_data.get("size") or ""
        product = Product.objects.get(id=product_id)

        cart = get_or_create_cart(request)
        cart_item, created = CartItem.objects.get_or_create(
            cart=cart, product=product, size=size, defaults={"quantity": 0}
        )

        desired_qty = cart_item.quantity + quantity
        # Stock is tracked per product, so count every size line in this cart.
        other_qty = (
            CartItem.objects.filter(cart=cart, product=product)
            .exclude(pk=cart_item.pk)
            .aggregate(total=Sum("quantity"))["total"]
            or 0
        )
        if other_qty + desired_qty > product.stock_quantity:
            return Response(
                {
                    "detail": f"Cannot add {quantity} item(s). Only {product.stock_quantity} left in stock.",
                    "available_stock": product.stock_quantity,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        cart_item.quantity = desired_qty
        cart_item.save()

        cart_serializer = CartSerializer(cart, context={"request": request})
        response = Response(cart_serializer.data, status=status.HTTP_201_CREATED)
        response["X-Cart-ID"] = str(cart.id)
        return response


class CartItemDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def patch(self, request, item_id):
        cart = get_or_create_cart(request)
        cart_item = get_object_or_404(CartItem, id=item_id, cart=cart)

        serializer = UpdateCartItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Update product if requested
        if "product_obj" in serializer.validated_data:
            new_product = serializer.validated_data["product_obj"]
            # Keep the size only if the new product offers it.
            new_size = cart_item.size
            if new_size and new_size not in new_product.sizes:
                new_size = ""
            # Check if another line for this product+size already exists
            existing_duplicate = (
                CartItem.objects.filter(
                    cart=cart, product=new_product, size=new_size
                )
                .exclude(id=cart_item.id)
                .first()
            )
            if existing_duplicate:
                existing_duplicate.quantity += cart_item.quantity
                existing_duplicate.save()
                cart_item.delete()
                cart_item = existing_duplicate
            else:
                cart_item.product = new_product
                cart_item.size = new_size

        # Update quantity if requested
        if "quantity" in serializer.validated_data:
            qty = serializer.validated_data["quantity"]
            # Stock is per product: total every other size line as well.
            other_qty = (
                CartItem.objects.filter(cart=cart, product=cart_item.product)
                .exclude(id=cart_item.id)
                .aggregate(total=Sum("quantity"))["total"]
                or 0
            )
            if qty + other_qty > cart_item.product.stock_quantity:
                return Response(
                    {
                        "detail": f"Only {cart_item.product.stock_quantity} unit(s) available.",
                        "available_stock": cart_item.product.stock_quantity,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            cart_item.quantity = qty

        cart_item.save()
        cart_serializer = CartSerializer(cart, context={"request": request})
        return Response(cart_serializer.data)

    def delete(self, request, item_id):
        cart = get_or_create_cart(request)
        cart_item = get_object_or_404(CartItem, id=item_id, cart=cart)
        cart_item.delete()

        cart_serializer = CartSerializer(cart, context={"request": request})
        return Response(cart_serializer.data, status=status.HTTP_200_OK)


class CartMergeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = MergeCartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        guest_cart_id = serializer.validated_data["guest_cart_id"]
        guest_cart = Cart.objects.filter(id=guest_cart_id, user__isnull=True).first()

        user_cart, _ = Cart.objects.get_or_create(user=request.user)

        if guest_cart:
            for guest_item in guest_cart.items.all():
                user_item, created = CartItem.objects.get_or_create(
                    cart=user_cart,
                    product=guest_item.product,
                    size=guest_item.size,
                    defaults={"quantity": guest_item.quantity},
                )
                if not created:
                    user_item.quantity += guest_item.quantity
                    user_item.save()

            guest_cart.delete()

        cart_serializer = CartSerializer(user_cart, context={"request": request})
        return Response(cart_serializer.data, status=status.HTTP_200_OK)

