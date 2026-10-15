import secrets
import uuid
from decimal import Decimal
from urllib.parse import quote

from django.conf import settings
from django.db import models, transaction
from django.db.models import F
from django.utils import timezone

from catalog.models import Product, ProductSize

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
    # Selected size ("" = one-size), so one product can sit on two lines.
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
        return (
            f"{self.quantity}x {self.product}{suffix} in Cart {str(self.cart_id)[:8]}"
        )


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
    size = models.CharField(max_length=50, blank=True, default="")
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
    """Readable order number, e.g. WAYAZ-2609-4821 (YYMM-XXXX). Uses
    `secrets` so numbers can't be predicted and probed."""
    stamp = timezone.now().strftime("%y%m")
    for _ in range(50):
        candidate = f"WAYAZ-{stamp}-{secrets.randbelow(9000) + 1000}"
        if not Order.objects.filter(order_number=candidate).exists():
            return candidate
    raise RuntimeError("Could not generate a unique order number")  # pragma: no cover


class Coupon(models.Model):
    """A checkout code that takes money off an order. Deliberately minimal:
    percent or fixed, on or off, audience, auto-apply. No expiry dates or
    usage caps until real usage data justifies them."""

    class DiscountType(models.TextChoices):
        PERCENT = "percent", "Percentage"
        FIXED = "fixed", "Fixed amount"

    class Audience(models.TextChoices):
        EVERYONE = "everyone", "Everyone"
        GUESTS = "guests", "Guests only"
        FIRST_ORDER = "first_order", "First-time customers"

    code = models.CharField(max_length=40, unique=True)
    discount_type = models.CharField(
        max_length=16, choices=DiscountType.choices, default=DiscountType.PERCENT
    )
    discount_value = models.DecimalField(max_digits=10, decimal_places=2)
    is_active = models.BooleanField(default=True)
    # Who the code is for; checked whether the shopper types it or it
    # applies itself.
    audience = models.CharField(
        max_length=16, choices=Audience.choices, default=Audience.EVERYONE
    )
    # Applies itself at checkout for eligible carts - no code typing.
    auto_apply = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        # Codes are typed by humans; normalise so WELCOME10 == welcome10.
        self.code = self.code.strip().upper()
        super().save(*args, **kwargs)

    def eligible_for(self, user):
        """Whether `user` (None = a guest cart) may use this coupon now."""
        if self.audience == self.Audience.EVERYONE:
            return True
        if self.audience == self.Audience.GUESTS:
            return user is None
        # First order: guests have no order history we can check, so a
        # guest cart counts as a first-time customer too.
        if user is None:
            return True
        return not Order.objects.filter(user=user).exists()

    def discount_for(self, amount):
        """Discount for a pre-discount `amount`, clamped so it is never
        worth more than what it comes off."""
        amount = Decimal(amount)  # an empty sum() is a plain int 0
        if self.discount_type == self.DiscountType.PERCENT:
            discount = amount * self.discount_value / Decimal("100")
        else:
            discount = self.discount_value
        return min(discount, amount).quantize(Decimal("0.01"))

    def __str__(self):
        return self.code


def auto_coupon_for(user, subtotal):
    """The best auto-applying coupon for this shopper, or None. "Best" is the
    largest discount on `subtotal` among eligible active codes, ties to the
    newest; an empty cart never matches."""
    best = None
    best_discount = Decimal("0.00")
    for coupon in Coupon.objects.filter(is_active=True, auto_apply=True):
        if not coupon.eligible_for(user):
            continue
        discount = coupon.discount_for(subtotal)
        if discount > best_discount:
            best, best_discount = coupon, discount
    return best


class Order(models.Model):
    class Status(models.TextChoices):
        PROCESSING = "PROCESSING", "Processing"
        CONFIRMED = "CONFIRMED", "Confirmed"
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
    delivery_method = models.CharField(
        max_length=32, choices=DELIVERY_ZONE_CHOICES, default="free", blank=True
    )
    shipping_fee = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00")
    )

    # Financials
    subtotal = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00")
    )
    coupon = models.ForeignKey(
        Coupon, null=True, blank=True, on_delete=models.SET_NULL, related_name="orders"
    )
    discount_amount = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00")
    )
    total_amount = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00")
    )

    # Status pipeline
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PROCESSING,
        db_index=True,
    )
    payment_method = models.CharField(
        max_length=16, choices=PaymentMethod.choices, default=PaymentMethod.COD
    )
    payment_status = models.CharField(
        max_length=16, choices=PaymentStatus.choices, default=PaymentStatus.PENDING
    )

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

        from catalog.models import StoreSettings

        try:
            configured = StoreSettings.load().whatsapp_number
        except Exception:
            configured = ""

        number = (
            str(configured or getattr(django_settings, "WHATSAPP_SUPPORT_NUMBER", ""))
            .replace("+", "")
            .replace(" ", "")
        )
        text = (
            f"Hello Wayaz, I'm following up on order {self.order_number} "
            f"(status: {self.get_status_display()}). "
            f"{self.item_count} item(s) - Ksh {self.total_amount}"
        )
        return f"https://wa.me/{number}?text={quote(text)}"

    def cancel(self):
        """Cancel the order and restore reserved stock to its size rows."""
        if self.status == self.Status.CANCELLED:
            return self
        with transaction.atomic():
            for item in self.items.all():
                if not item.product_id:
                    continue
                restored = ProductSize.objects.filter(
                    product_id=item.product_id, size=item.size
                ).update(quantity=F("quantity") + item.quantity)
                if not restored and item.size == "":
                    # Only re-create a one-size row: legacy items carry no
                    # size, so their units aren't attributable on sized goods.
                    has_sized_rows = (
                        ProductSize.objects.filter(product_id=item.product_id)
                        .exclude(size="")
                        .exists()
                    )
                    if not has_sized_rows:
                        ProductSize.objects.create(
                            product_id=item.product_id,
                            size="",
                            quantity=item.quantity,
                        )
            self.status = self.Status.CANCELLED
            self.save(update_fields=["status", "updated_at"])
        return self

    def __str__(self):
        return f"{self.order_number} ({self.get_status_display()})"
