from django.contrib import admin
from .models import Cart, CartItem, Order, OrderItem


class CartItemInline(admin.TabularInline):
    model = CartItem
    extra = 0
    readonly_fields = ("product", "quantity", "unit_price", "line_total", "added_at")


@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "total_items", "subtotal", "updated_at", "created_at")
    search_fields = ("id", "user__username", "user__email", "session_key")
    inlines = [CartItemInline]


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ("product", "product_title", "unit_price", "quantity")


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = (
        "order_number",
        "shipping_name",
        "status",
        "payment_method",
        "payment_status",
        "total_amount",
        "created_at",
    )
    list_filter = ("status", "payment_method", "delivery_method", "payment_status")
    search_fields = ("order_number", "email", "phone_number", "shipping_name")
    inlines = [OrderItemInline]
    readonly_fields = (
        "order_number",
        "user",
        "guest_id",
        "email",
        "phone_number",
        "shipping_name",
        "county",
        "town",
        "street_address",
        "delivery_method",
        "shipping_fee",
        "subtotal",
        "discount_amount",
        "total_amount",
        "created_at",
        "updated_at",
    )
    actions = ["cancel_orders"]

    @admin.action(description="Cancel selected orders (restores stock)")
    def cancel_orders(self, request, queryset):
        for order in queryset:
            order.cancel()
