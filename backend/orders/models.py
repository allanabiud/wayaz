import uuid
from decimal import Decimal
from django.conf import settings
from django.db import models
from catalog.models import ProductVariant


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

    @property
    def free_shipping_threshold(self):
        return Decimal("5000.00")

    @property
    def amount_to_free_shipping(self):
        diff = self.free_shipping_threshold - self.subtotal
        return max(Decimal("0.00"), diff)

    @property
    def has_free_shipping(self):
        return self.subtotal >= self.free_shipping_threshold

    def __str__(self):
        owner = self.user.display_name if self.user else f"Guest ({str(self.id)[:8]})"
        return f"Cart {owner} - {self.total_items} items (Ksh {self.subtotal})"


class CartItem(models.Model):
    cart = models.ForeignKey(
        Cart, on_delete=models.CASCADE, related_name="items"
    )
    variant = models.ForeignKey(
        ProductVariant, on_delete=models.CASCADE, related_name="cart_items"
    )
    quantity = models.PositiveIntegerField(default=1)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("cart", "variant")
        ordering = ["added_at"]

    @property
    def unit_price(self):
        return self.variant.effective_price

    @property
    def line_total(self):
        return self.unit_price * self.quantity

    def __str__(self):
        return f"{self.quantity}x {self.variant} in Cart {str(self.cart_id)[:8]}"
