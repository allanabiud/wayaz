import random
import uuid
from decimal import Decimal
from urllib.parse import quote

from django.conf import settings
from django.db import models
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from catalog.models import Product
from .delivery import DELIVERY_ZONE_CHOICES


class Cart(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="carts",
    )
    session_key = models.CharField(max_length=64, blank=True, null=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    @property
    def total_items(self):
        return sum(item.quantity for item in self.items.all())

    @property
    def subtotal(self):
        return sum(item.line_total for item in self.items.all())

    def __str__(self):
        owner = self.user.display_name if self.user else f"Guest ({str(self.id)[:8]})"
        return f"Cart {owner} - {self.total_items} items (Ksh {self.subtotal})"


class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="cart_items"
    )
    # Selected size ("" = one-size product), so the same product in two
    # sizes can sit on two separate lines.
    size = models.CharField(max_length=50, blank=True, default="")
    quantity = models.PositiveIntegerField(default=1)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("cart", "product", "size")
        ordering = ["added_at"]

    @property
    def unit_price(self):
        return self.product.current_price

    @property
    def line_total(self):
        return self.unit_price * self.quantity

    def __str__(self):
        suffix = f" [{self.size}]" if self.size else ""
        return f"{self.quantity}x {self.product}{suffix} in Cart {str(self.cart_id)[:8]}"


class OrderItem(models.Model):
    order = models.ForeignKey("Order", on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(
        Product,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="order_items",
    )
    # Snapshots captured at purchase time so history survives catalog edits.
    product_title = models.CharField(max_length=255)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["id"]

    @property
    def line_total(self):
        return self.unit_price * self.quantity

    def __str__(self):
        return f"{self.quantity}x {self.product_title} in {self.order.order_number}"


def generate_order_number():
    """Readable order number, e.g. WAYAZ-2609-4821 (YYMM-XXXX)."""
    stamp = timezone.now().strftime("%y%m")
    for _ in range(50):
        candidate = f"WAYAZ-{stamp}-{random.randint(1000, 9999)}"
        if not Order.objects.filter(order_number=candidate).exists():
            return candidate
    raise RuntimeError("Could not generate a unique order number")  # pragma: no cover


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING_PAYMENT = "PENDING_PAYMENT", "Pending payment"
        PAID = "PAID", "Paid"
        PROCESSING = "PROCESSING", "Processing"
        SHIPPED = "SHIPPED", "Shipped"
        DELIVERED = "DELIVERED", "Delivered"
        CANCELLED = "CANCELLED", "Cancelled"

    class PaymentMethod(models.TextChoices):
        COD = "cod", "Cash on delivery"
        M_PESA = "mpesa", "M-Pesa STK Push"

    class PaymentStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PAID = "PAID", "Paid"
        FAILED = "FAILED", "Failed"
        REFUNDED = "REFUNDED", "Refunded"

    order_number = models.CharField(max_length=20, unique=True, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="orders",
    )
    guest_id = models.CharField(max_length=64, blank=True, db_index=True)

    # Contact details
    email = models.EmailField()
    phone_number = models.CharField(max_length=25)

    # Shipping snapshot
    shipping_name = models.CharField(max_length=150)
    county = models.CharField(max_length=100)
    town = models.CharField(max_length=100)
    street_address = models.CharField(max_length=255)
    delivery_method = models.CharField(max_length=32, choices=DELIVERY_ZONE_CHOICES)
    shipping_fee = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00")
    )

    # Financials
    subtotal = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00")
    )
    discount_amount = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00")
    )
    total_amount = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00")
    )

    # Status pipeline
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING_PAYMENT
    )
    payment_method = models.CharField(
        max_length=16, choices=PaymentMethod.choices, default=PaymentMethod.COD
    )
    payment_status = models.CharField(
        max_length=16, choices=PaymentStatus.choices, default=PaymentStatus.PENDING
    )
    requires_manual_verification = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.order_number:
            self.order_number = generate_order_number()
        super().save(*args, **kwargs)

    @property
    def item_count(self):
        return sum(item.quantity for item in self.items.all())

    @property
    def whatsapp_link(self):
        """Formatted WhatsApp dispatch/support link for the order success page."""
        from django.conf import settings as django_settings

        number = str(
            getattr(django_settings, "WHATSAPP_SUPPORT_NUMBER", "")
        ).replace("+", "").replace(" ", "")
        text = (
            f"Hello Wayaz, I'm following up on order {self.order_number} "
            f"(status: {self.get_status_display()}). "
            f"{self.item_count} item(s) - Ksh {self.total_amount}"
        )
        return f"https://wa.me/{number}?text={quote(text)}"

    def cancel(self):
        """Cancel the order and restore reserved stock to its products."""
        if self.status == self.Status.CANCELLED:
            return self
        with transaction.atomic():
            for item in self.items.all():
                if item.product_id:
                    Product.objects.filter(pk=item.product_id).update(
                        stock_quantity=F("stock_quantity") + item.quantity
                    )
            self.status = self.Status.CANCELLED
            self.save(update_fields=["status", "updated_at"])
        return self

    def __str__(self):
        return f"{self.order_number} ({self.get_status_display()})"
