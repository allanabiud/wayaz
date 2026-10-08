from django.contrib import admin
from django.utils.html import format_html
from .models import Category, Product, ProductImage, ProductReview


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1
    fields = ("image", "image_preview", "alt_text", "is_primary", "display_order")
    readonly_fields = ("image_preview",)

    def image_preview(self, obj):
        if obj.image:
            return format_html(
                '<img src="{}" style="width: 50px; height: 75px; object-fit: cover; border-radius: 4px;" />',
                obj.image.url,
            )
        return "-"
    image_preview.short_description = "Preview"


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "display_order", "created_at")
    list_editable = ("display_order",)
    search_fields = ("name", "description")
    prepopulated_fields = {"slug": ("name",)}

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "category",
        "base_price",
        "sale_price",
        "total_stock_display",
    )
    list_filter = ("category",)
    search_fields = ("title", "description")
    prepopulated_fields = {"slug": ("title",)}
    inlines = [ProductImageInline]

    def total_stock_display(self, obj):
        stock = obj.stock_quantity
        color = "green" if stock > 10 else ("orange" if stock > 0 else "red")
        return format_html('<span style="color: {}; font-weight: bold;">{}</span>', color, stock)
    total_stock_display.short_description = "Stock"


@admin.register(ProductReview)
class ProductReviewAdmin(admin.ModelAdmin):
    list_display = ("product", "user", "rating", "updated_at")
    list_filter = ("rating", "created_at")
    search_fields = ("product__title", "user__username", "user__email")
    readonly_fields = ("product", "user", "rating", "created_at", "updated_at")

    # Ratings are storefront-only; admins moderate by deleting, not editing.
    def has_add_permission(self, request):
        return False
