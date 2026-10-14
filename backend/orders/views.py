import uuid
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.serializers import ValidationError
from rest_framework.views import APIView

from accounts.models import Address
from catalog.models import Product

from .delivery import delivery_fee
from .emails import send_new_order_email_merchant, send_order_confirmation_email
from .models import Cart, CartItem, Coupon, Order, OrderItem, auto_coupon_for
from .serializers import (
    AddToCartSerializer,
    CartSerializer,
    CheckoutSerializer,
    CouponValidateSerializer,
    MergeCartSerializer,
    OrderSerializer,
    UpdateCartItemSerializer,
)
from .tokens import make_payment_token


def get_or_create_cart(request):
    """Cart for signed-in users, or guest cart via X-Cart-ID header / cart_id param."""
    if request.user.is_authenticated:
        cart, _ = Cart.objects.get_or_create(user=request.user)
        return cart

    cart_id_str = request.headers.get("X-Cart-ID") or request.query_params.get(
        "cart_id"
    )

    if cart_id_str:
        try:
            cart_uuid = uuid.UUID(cart_id_str)
            cart = Cart.objects.filter(id=cart_uuid, user__isnull=True).first()
            if cart:
                return cart
        except (ValueError, AttributeError):
            pass

    return Cart.objects.create()


GUEST_CART_ID_HEADER = [
    OpenApiParameter(
        "X-Cart-ID",
        OpenApiTypes.STR,
        location=OpenApiParameter.HEADER,
        description="Guest cart UUID token (ignored for signed-in users).",
        required=False,
    )
]


class CartDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        summary="Retrieve active cart",
        parameters=GUEST_CART_ID_HEADER,
        responses={200: CartSerializer},
    )
    def get(self, request):
        cart = get_or_create_cart(request)
        # Prefetch to avoid N+1 during serialization.
        cart = (
            Cart.objects.filter(pk=cart.pk)
            .prefetch_related("items__product__images", "items__product__category")
            .first()
            or cart
        )
        serializer = CartSerializer(cart, context={"request": request})
        response = Response(serializer.data)
        response["X-Cart-ID"] = str(cart.id)
        return response

    @extend_schema(
        summary="Clear active cart",
        parameters=GUEST_CART_ID_HEADER,
        responses={200: CartSerializer},
    )
    def delete(self, request):
        cart = get_or_create_cart(request)
        cart.items.all().delete()
        serializer = CartSerializer(cart, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class CartItemAddView(APIView):
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        summary="Add item to cart",
        parameters=GUEST_CART_ID_HEADER,
        request=AddToCartSerializer,
        responses={201: CartSerializer},
    )
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

    @extend_schema(
        summary="Update cart item quantity or product",
        parameters=GUEST_CART_ID_HEADER,
        request=UpdateCartItemSerializer,
        responses={200: CartSerializer},
    )
    def patch(self, request, item_id):
        cart = get_or_create_cart(request)
        cart_item = get_object_or_404(CartItem, id=item_id, cart=cart)

        serializer = UpdateCartItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if "product_obj" in serializer.validated_data:
            new_product = serializer.validated_data["product_obj"]
            new_size = cart_item.size
            if new_size and new_size not in new_product.sizes:
                new_size = ""
            existing_duplicate = (
                CartItem.objects.filter(cart=cart, product=new_product, size=new_size)
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

        # Lines are unique per (cart, product, size), so moving onto an
        # occupied size merges quantities instead of duplicating the row.
        if "size" in serializer.validated_data:
            requested = serializer.validated_data["size"].strip()
            product = cart_item.product
            if product.sizes:
                if requested and requested not in product.sizes:
                    return Response(
                        {"size": f"Choose one of: {', '.join(product.sizes)}."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            else:
                requested = ""

            if requested != cart_item.size:
                duplicate = (
                    CartItem.objects.filter(cart=cart, product=product, size=requested)
                    .exclude(id=cart_item.id)
                    .first()
                )
                if duplicate:
                    combined = duplicate.quantity + cart_item.quantity
                    if combined > product.stock_quantity:
                        return Response(
                            {
                                "detail": (
                                    f"Only {product.stock_quantity} unit(s) available."
                                ),
                                "available_stock": product.stock_quantity,
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    duplicate.quantity = combined
                    duplicate.save()
                    cart_item.delete()
                    cart_item = duplicate
                else:
                    cart_item.size = requested

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

    @extend_schema(
        summary="Remove item from cart",
        parameters=GUEST_CART_ID_HEADER,
        responses={200: CartSerializer},
    )
    def delete(self, request, item_id):
        cart = get_or_create_cart(request)
        cart_item = get_object_or_404(CartItem, id=item_id, cart=cart)
        cart_item.delete()

        cart_serializer = CartSerializer(cart, context={"request": request})
        return Response(cart_serializer.data, status=status.HTTP_200_OK)


class CartMergeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        summary="Merge guest cart into authenticated user cart",
        request=MergeCartSerializer,
        responses={200: CartSerializer},
    )
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


class OrderListView(generics.ListAPIView):
    """Signed-in shopper's order history; guest checkouts are not returned."""

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = OrderSerializer

    def get_queryset(self):
        return (
            Order.objects.filter(user=self.request.user)
            .select_related("coupon")
            .prefetch_related("items")
            .order_by("-created_at")
        )


class CheckoutView(APIView):
    """Creates the order atomically with select_for_update product locks so
    concurrent checkouts cannot oversell."""

    permission_classes = [permissions.AllowAny]

    @extend_schema(
        summary="Create order from active cart",
        parameters=GUEST_CART_ID_HEADER,
        request=CheckoutSerializer,
        responses={201: OrderSerializer},
    )
    def post(self, request):
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        cart = get_or_create_cart(request)
        items = list(cart.items.select_related("product"))
        if not items:
            return Response(
                {"detail": "Your cart is empty."}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            with transaction.atomic():
                locked_products = {
                    product.id: product
                    for product in Product.objects.select_for_update().filter(
                        id__in=[item.product_id for item in items]
                    )
                }

                # Stock is per product, so total every size line together.
                required: dict[int, int] = {}
                for item in items:
                    required[item.product_id] = (
                        required.get(item.product_id, 0) + item.quantity
                    )
                for product_id, needed in required.items():
                    product = locked_products[product_id]
                    if needed > product.stock_quantity:
                        raise ValidationError(
                            {
                                "detail": (
                                    f"Only {product.stock_quantity} unit(s) of "
                                    f"{product.title} available."
                                ),
                                "available_stock": product.stock_quantity,
                            }
                        )

                # Cart lines may sit size-less until the shopper picks one.
                unsized = next(
                    (item for item in items if item.product.sizes and not item.size),
                    None,
                )
                if unsized is not None:
                    raise ValidationError(
                        {
                            "detail": (
                                f"Choose a size for {unsized.product.title} "
                                "before checking out."
                            ),
                            "missing_size_item_id": unsized.id,
                        }
                    )

                subtotal = sum(item.line_total for item in items)
                shipping_fee = delivery_fee(data["delivery_method"], subtotal)
                discount = Decimal("0.00")
                coupon = None
                user = request.user if request.user.is_authenticated else None
                if "coupon_code" in data:
                    # Named coupon (blank = explicitly none) overrides auto-apply.
                    code = (data["coupon_code"] or "").strip()
                    if code:
                        coupon = Coupon.objects.filter(
                            code__iexact=code, is_active=True
                        ).first()
                        if coupon is None or not coupon.eligible_for(user):
                            raise ValidationError(
                                {"coupon_code": "That coupon code is not valid."}
                            )
                        # Discounts come off the goods, not the delivery fee.
                        discount = coupon.discount_for(subtotal)
                else:
                    # No client opinion: an eligible auto-coupon may claim it.
                    coupon = auto_coupon_for(user, subtotal)
                    if coupon is not None:
                        discount = coupon.discount_for(subtotal)
                total = subtotal + shipping_fee - discount

                # New orders start PROCESSING; staff confirm from the dashboard.
                order_status = Order.Status.PROCESSING

                order = Order.objects.create(
                    user=request.user if request.user.is_authenticated else None,
                    guest_id=data.get("guest_id")
                    or (str(cart.id) if not request.user.is_authenticated else ""),
                    email=data["email"],
                    phone_number=data["phone_number"],
                    shipping_name=data["full_name"],
                    county=data["county"],
                    town=data["town"],
                    street_address=data["street_address"],
                    delivery_method=data["delivery_method"],
                    shipping_fee=shipping_fee,
                    subtotal=subtotal,
                    coupon=coupon,
                    discount_amount=discount,
                    total_amount=total,
                    status=order_status,
                    payment_method=data["payment_method"],
                )

                for item in items:
                    product = locked_products[item.product_id]
                    OrderItem.objects.create(
                        order=order,
                        product=product,
                        product_title=product.title,
                        unit_price=product.current_price,
                        quantity=item.quantity,
                    )
                    product.stock_quantity -= item.quantity
                    product.save(update_fields=["stock_quantity"])

                cart.items.all().delete()

                if request.user.is_authenticated:
                    u = request.user
                    if not u.phone_number and data.get("phone_number"):
                        u.phone_number = data["phone_number"]
                        u.save(update_fields=["phone_number"])

                    existing_addr = Address.objects.filter(
                        user=u,
                        county=data["county"],
                        town=data["town"],
                        street_address=data["street_address"],
                    ).first()
                    if not existing_addr:
                        has_addresses = Address.objects.filter(user=u).exists()
                        Address.objects.create(
                            user=u,
                            full_name=data["full_name"],
                            phone_number=data["phone_number"],
                            county=data["county"],
                            town=data["town"],
                            street_address=data["street_address"],
                            is_default=not has_addresses,
                        )
        except ValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)

        # Fire-and-forget emails: shopper confirmation + merchant copy.
        send_order_confirmation_email(order)
        send_new_order_email_merchant(order)

        # Capability token for driving M-Pesa STK; the only place it is
        # handed out (see orders/tokens.py).
        payload = OrderSerializer(order).data
        payload["payment_token"] = make_payment_token(order)
        return Response(payload, status=status.HTTP_201_CREATED)


class CouponValidateView(APIView):
    """Dry-run a coupon against the caller's cart so checkout can preview the
    discount. With a `code` it checks that coupon; without one it answers
    "what would auto-apply here?" (`auto_applied` reports which happened)."""

    permission_classes = [permissions.AllowAny]
    serializer_class = CouponValidateSerializer

    @extend_schema(
        summary="Validate or auto-apply coupon code to current cart",
        parameters=GUEST_CART_ID_HEADER,
        request=CouponValidateSerializer,
    )
    def post(self, request):
        serializer = CouponValidateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = (serializer.validated_data.get("code") or "").strip()

        cart = get_or_create_cart(request)
        subtotal = sum(item.line_total for item in cart.items.all())
        user = request.user if request.user.is_authenticated else None

        if code:
            try:
                coupon = Coupon.objects.get(code__iexact=code, is_active=True)
            except Coupon.DoesNotExist:
                coupon = None
            if coupon is None or not coupon.eligible_for(user):
                return Response(
                    {"detail": "That coupon code is not valid."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            auto_applied = False
        else:
            coupon = auto_coupon_for(user, subtotal)
            auto_applied = True

        return Response(
            {
                "code": coupon.code if coupon else None,
                "discount_type": coupon.discount_type if coupon else None,
                "discount_amount": str(
                    coupon.discount_for(subtotal) if coupon else Decimal("0.00")
                ),
                "cart_subtotal": str(subtotal),
                "auto_applied": auto_applied,
            }
        )
