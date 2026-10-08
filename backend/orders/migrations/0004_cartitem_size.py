from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("orders", "0003_cartitem_orderitem_product"),
    ]

    operations = [
        migrations.AddField(
            model_name="cartitem",
            name="size",
            field=models.CharField(blank=True, default="", max_length=50),
        ),
        migrations.AlterUniqueTogether(
            name="cartitem",
            unique_together={("cart", "product", "size")},
        ),
    ]
