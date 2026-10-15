from django.db import migrations


def split_stock(apps, schema_editor):
    """One row per offered size; legacy stock is split evenly (remainder
    goes to the first sizes). One-size products get a single "" row."""
    Product = apps.get_model("catalog", "Product")
    ProductSize = apps.get_model("catalog", "ProductSize")

    for product in Product.objects.all():
        sizes = [str(s).strip() for s in (product.sizes or []) if str(s).strip()]
        stock = product.stock_quantity or 0
        if not sizes:
            ProductSize.objects.create(product=product, size="", quantity=stock)
            continue
        base, extra = divmod(stock, len(sizes))
        for index, label in enumerate(dict.fromkeys(sizes)):
            ProductSize.objects.create(
                product=product,
                size=label,
                quantity=base + (1 if index < extra else 0),
                display_order=index,
            )


def merge_stock(apps, schema_editor):
    Product = apps.get_model("catalog", "Product")
    ProductSize = apps.get_model("catalog", "ProductSize")

    for product in Product.objects.all():
        total = sum(row.quantity for row in product.size_stock.all())
        product.stock_quantity = total
        product.sizes = [row.size for row in product.size_stock.all() if row.size]
        product.save(update_fields=["stock_quantity", "sizes"])


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0018_productsize"),
    ]

    operations = [
        migrations.RunPython(split_stock, merge_stock),
    ]
