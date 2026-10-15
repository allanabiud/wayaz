"""Helpers for building products with their per-size stock rows."""

from .models import Product, ProductSize


def create_product(**kwargs):
    """Create a product; accepts legacy `stock_quantity`/`sizes` kwargs to
    populate size rows (stock split evenly, remainder to the first sizes)."""
    stock = kwargs.pop("stock_quantity", 0)
    sizes = kwargs.pop("sizes", [])
    product = Product.objects.create(**kwargs)
    set_size_stock(product, stock, sizes)
    return product


def set_size_stock(product, stock, sizes=()):
    """Replace a product's stock rows with an even split across `sizes`
    (or one "" row when the product is one-size)."""
    product.size_stock.all().delete()
    if not sizes:
        ProductSize.objects.create(product=product, size="", quantity=stock)
        return product
    base, extra = divmod(stock, len(sizes))
    ProductSize.objects.bulk_create(
        [
            ProductSize(
                product=product,
                size=size,
                quantity=base + (1 if index < extra else 0),
                display_order=index,
            )
            for index, size in enumerate(sizes)
        ]
    )
    return product
