from django.db import migrations, models
from django.db.models import Sum


def forwards_stock_quantity(apps, schema_editor):
    """Seed each product's stock_quantity from the sum of its variants' stock."""
    Product = apps.get_model("catalog", "Product")
    ProductVariant = apps.get_model("catalog", "ProductVariant")

    totals = ProductVariant.objects.values("product_id").annotate(
        total=Sum("stock_quantity")
    )
    for row in totals:
        Product.objects.filter(pk=row["product_id"]).update(
            stock_quantity=row["total"] or 0
        )


class Migration(migrations.Migration):
    dependencies = [
        # Variant data must be read before the model (and table) is removed.
        ("orders", "0003_cartitem_orderitem_product"),
        ("catalog", "0003_remove_product_brand_remove_productvariant_sku_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="stock_quantity",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.RunPython(forwards_stock_quantity, migrations.RunPython.noop),
        migrations.DeleteModel(name="ProductVariant"),
    ]
