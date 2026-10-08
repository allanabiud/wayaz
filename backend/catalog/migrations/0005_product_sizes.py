from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0004_product_stock_quantity_remove_productvariant"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="sizes",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
