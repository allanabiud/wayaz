from django.contrib import admin
from django.utils.html import format_html
from .models import Category, Brand, Product, ProductImage, ProductVariant


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1
    fields = ("image", "image_preview", "alt_text", "is_primary", "display_order")
    readonly_fields = ("image_preview",)

    def image_preview(self, obj):
        if obj.image:
            return format_html(
                '<img src="{}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;" />',
                obj.image.url,
            )
        return "-"
    image_preview.short_description = "Preview"


class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 1
    fields = (
        "sku",
        "color_name",
        "color_hex",
        "color_preview",
        "size",
        "price_override",
        "stock_quantity",
    )
    readonly_fields = ("color_preview",)

    def color_preview(self, obj):
        if obj.color_hex:
            return format_html(
                '<div style="width: 20px; height: 20px; border-radius: 50%; background-color: {}; border: 1px solid #ccc;"></div>',
                obj.color_hex,
            )
        return "-"
    color_preview.short_description = "Color"


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "is_featured", "display_order", "created_at")
    list_editable = ("is_featured", "display_order")
    search_fields = ("name", "description")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "is_featured")
    list_editable = ("is_featured",)
    search_fields = ("name",)
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "category",
        "brand",
        "base_price",
        "sale_price",
        "total_stock_display",
        "is_featured",
        "is_trending",
        "is_new_arrival",
    )
    list_filter = (
        "category",
        "brand",
        "is_featured",
        "is_trending",
        "is_new_arrival",
    )
    search_fields = ("title", "description", "variants__sku")
    prepopulated_fields = {"slug": ("title",)}
    inlines = [ProductImageInline, ProductVariantInline]

    def total_stock_display(self, obj):
        stock = obj.total_stock
        color = "green" if stock > 10 else ("orange" if stock > 0 else "red")
        return format_html('<span style="color: {}; font-weight: bold;">{}</span>', color, stock)
    total_stock_display.short_description = "Stock"


@admin.register(ProductVariant)
class ProductVariantAdmin(admin.ModelAdmin):
    list_display = (
        "sku",
        "product",
        "color_name",
        "color_hex",
        "size",
        "effective_price",
        "stock_quantity",
    )
    list_filter = ("product__category", "color_name", "size")
    search_fields = ("sku", "product__title", "color_name")
