import django.db.models.deletion
from django.db import migrations, models


def forwards_cart_items(apps, schema_editor):
    """Point every cart line at its variant's product, merging duplicates."""
    CartItem = apps.get_model("orders", "CartItem")
    ProductVariant = apps.get_model("catalog", "ProductVariant")

    seen = {}
    for item in CartItem.objects.order_by("id").all():
        product_id = None
        if item.variant_id:
            product_id = (
                ProductVariant.objects.filter(pk=item.variant_id)
                .values_list("product_id", flat=True)
                .first()
            )
        if product_id is None:
            item.delete()
            continue

        key = (item.cart_id, product_id)
        if key in seen:
            keeper = seen[key]
            keeper.quantity += item.quantity
            keeper.save(update_fields=["quantity"])
            item.delete()
        else:
            item.product_id = product_id
            item.save(update_fields=["product"])
            seen[key] = item


def forwards_order_items(apps, schema_editor):
    """Point every order line at its variant's product (product may be null)."""
    OrderItem = apps.get_model("orders", "OrderItem")
    ProductVariant = apps.get_model("catalog", "ProductVariant")

    for item in OrderItem.objects.all():
        product_id = None
        if item.variant_id:
            product_id = (
                ProductVariant.objects.filter(pk=item.variant_id)
                .values_list("product_id", flat=True)
                .first()
            )
        OrderItem.objects.filter(pk=item.pk).update(product_id=product_id)


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0003_remove_product_brand_remove_productvariant_sku_and_more"),
        ("orders", "0002_order_orderitem"),
    ]

    operations = [
        migrations.AddField(
            model_name="cartitem",
            name="product",
            field=models.ForeignKey(
                null=True,
                blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="cart_items",
                to="catalog.product",
            ),
        ),
        migrations.RunPython(forwards_cart_items, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="cartitem",
            name="product",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="cart_items",
                to="catalog.product",
            ),
        ),
        migrations.AlterUniqueTogether(
            name="cartitem",
            unique_together={("cart", "product")},
        ),
        migrations.RemoveField(model_name="cartitem", name="variant"),
        migrations.AddField(
            model_name="orderitem",
            name="product",
            field=models.ForeignKey(
                null=True,
                blank=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="order_items",
                to="catalog.product",
            ),
        ),
        migrations.RunPython(forwards_order_items, migrations.RunPython.noop),
        migrations.RemoveField(model_name="orderitem", name="variant"),
        migrations.RemoveField(model_name="orderitem", name="variant_snapshot"),
    ]
