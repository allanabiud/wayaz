from django.core.management.base import BaseCommand
from catalog.models import Category, Brand, Product, ProductVariant


class Command(BaseCommand):
    help = "Seeds initial catalog categories, brands, products, and variants inspired by Hiii-Style"

    def handle(self, *args, **options):
        self.stdout.write("Starting catalog seeding...")

        # 1. Categories
        categories_data = [
            {
                "name": "Bath & Body",
                "description": "Luxurious skincare, lotions, scrubs, and body washes.",
                "is_featured": True,
                "display_order": 1,
            },
            {
                "name": "Headphones & Audio",
                "description": "Premium wireless headphones, earbuds, and portable audio.",
                "is_featured": True,
                "display_order": 2,
            },
            {
                "name": "Backpacks & Bags",
                "description": "Stylish everyday backpacks, travel bags, and totes.",
                "is_featured": True,
                "display_order": 3,
            },
            {
                "name": "Accessories & Jewelry",
                "description": "Curated watches, sunglasses, chains, and lifestyle essentials.",
                "is_featured": True,
                "display_order": 4,
            },
            {
                "name": "Home & Kitchen",
                "description": "Modern kitchenware, cookware, and decorative home items.",
                "is_featured": False,
                "display_order": 5,
            },
        ]

        categories = {}
        for cdata in categories_data:
            cat, created = Category.objects.update_or_create(
                name=cdata["name"],
                defaults=cdata,
            )
            categories[cdata["name"]] = cat
            self.stdout.write(f"  Category: {cat.name} ({'created' if created else 'updated'})")

        # 2. Brands
        brands_data = [
            {"name": "Oraimo", "is_featured": True},
            {"name": "Enliven", "is_featured": True},
            {"name": "Anker", "is_featured": True},
            {"name": "CeraVe", "is_featured": True},
            {"name": "Hiii-Curated", "is_featured": True},
        ]

        brands = {}
        for bdata in brands_data:
            br, created = Brand.objects.update_or_create(
                name=bdata["name"],
                defaults=bdata,
            )
            brands[bdata["name"]] = br
            self.stdout.write(f"  Brand: {br.name} ({'created' if created else 'updated'})")

        # 3. Products and Variants
        products_data = [
            {
                "title": "Oraimo BoomPop 2 ENC Wireless Over-Ear Headphones",
                "category": categories["Headphones & Audio"],
                "brand": brands["Oraimo"],
                "description": "Experience deep bass, 60-hour playtime, and active environmental noise cancellation with plush over-ear memory foam cushions.",
                "base_price": 4500.00,
                "sale_price": 3800.00,
                "is_featured": True,
                "is_trending": True,
                "is_new_arrival": True,
                "variants": [
                    {
                        "sku": "ORA-BP2-BLK",
                        "color_name": "Matte Black",
                        "color_hex": "#1C1C1C",
                        "size": "Standard",
                        "stock_quantity": 25,
                    },
                    {
                        "sku": "ORA-BP2-SLV",
                        "color_name": "Silver Moonlight",
                        "color_hex": "#D1D5DB",
                        "size": "Standard",
                        "stock_quantity": 14,
                    },
                    {
                        "sku": "ORA-BP2-BEG",
                        "color_name": "Cream Beige",
                        "color_hex": "#E5D3B3",
                        "size": "Standard",
                        "stock_quantity": 0,  # Out of stock for restock testing
                    },
                ],
            },
            {
                "title": "Enliven Coconut & Vanilla Hydrating Shower Gel 500ml",
                "category": categories["Bath & Body"],
                "brand": brands["Enliven"],
                "description": "Specially formulated with natural extract of coconut and vanilla to leave your skin feeling fresh, soft, and smelling delicious.",
                "base_price": 1200.00,
                "sale_price": 950.00,
                "is_featured": True,
                "is_trending": True,
                "is_new_arrival": False,
                "variants": [
                    {
                        "sku": "ENL-SHW-500",
                        "color_name": "Vanilla Cream",
                        "color_hex": "#F3E5AB",
                        "size": "500ml",
                        "stock_quantity": 50,
                    },
                    {
                        "sku": "ENL-SHW-1000",
                        "color_name": "Vanilla Cream",
                        "color_hex": "#F3E5AB",
                        "size": "1000ml",
                        "price_override": 1700.00,
                        "stock_quantity": 20,
                    },
                ],
            },
            {
                "title": "Nordic Minimalist Waterproof Commuter Backpack",
                "category": categories["Backpacks & Bags"],
                "brand": brands["Hiii-Curated"],
                "description": "Ergonomic, water-repellent Oxford canvas backpack with dedicated 15.6-inch laptop compartment, hidden anti-theft pocket, and USB pass-through.",
                "base_price": 5500.00,
                "sale_price": 4600.00,
                "is_featured": True,
                "is_trending": True,
                "is_new_arrival": True,
                "variants": [
                    {
                        "sku": "NORD-BP-BLK",
                        "color_name": "Obsidian Black",
                        "color_hex": "#0D0D0D",
                        "size": "15.6 inch",
                        "stock_quantity": 18,
                    },
                    {
                        "sku": "NORD-BP-GRY",
                        "color_name": "Slate Grey",
                        "color_hex": "#4B5563",
                        "size": "15.6 inch",
                        "stock_quantity": 8,
                    },
                    {
                        "sku": "NORD-BP-OLV",
                        "color_name": "Olive Green",
                        "color_hex": "#4B5320",
                        "size": "15.6 inch",
                        "stock_quantity": 5,
                    },
                ],
            },
            {
                "title": "CeraVe Moisturizing Cream with Hyaluronic Acid",
                "category": categories["Bath & Body"],
                "brand": brands["CeraVe"],
                "description": "Developed with dermatologists, this rich, non-greasy formula provides 24-hour hydration with 3 essential ceramides and MVE delivery technology.",
                "base_price": 2800.00,
                "sale_price": None,
                "is_featured": True,
                "is_trending": False,
                "is_new_arrival": True,
                "variants": [
                    {
                        "sku": "CRV-MC-236",
                        "color_name": "White",
                        "color_hex": "#FFFFFF",
                        "size": "236ml",
                        "stock_quantity": 30,
                    },
                    {
                        "sku": "CRV-MC-453",
                        "color_name": "White",
                        "color_hex": "#FFFFFF",
                        "size": "453g",
                        "price_override": 3900.00,
                        "stock_quantity": 12,
                    },
                ],
            },
            {
                "title": "Anker Soundcore Space One Active Noise Cancelling Headphones",
                "category": categories["Headphones & Audio"],
                "brand": brands["Anker"],
                "description": "2X stronger voice reduction, 40-hour ANC playtime, LDAC Hi-Res Wireless Audio, and adaptive noise cancellation customized to your ear canal.",
                "base_price": 12500.00,
                "sale_price": 10999.00,
                "is_featured": True,
                "is_trending": True,
                "is_new_arrival": True,
                "variants": [
                    {
                        "sku": "ANK-SP1-JET",
                        "color_name": "Jet Black",
                        "color_hex": "#111827",
                        "size": "Standard",
                        "stock_quantity": 10,
                    },
                    {
                        "sku": "ANK-SP1-SKY",
                        "color_name": "Sky Blue",
                        "color_hex": "#87CEEB",
                        "size": "Standard",
                        "stock_quantity": 4,
                    },
                    {
                        "sku": "ANK-SP1-LTT",
                        "color_name": "Latte Cream",
                        "color_hex": "#D2B48C",
                        "size": "Standard",
                        "stock_quantity": 6,
                    },
                ],
            },
            {
                "title": "Cuban Link Stainless Steel Gold Choker Chain",
                "category": categories["Accessories & Jewelry"],
                "brand": brands["Hiii-Curated"],
                "description": "Heavy-duty 18k PVD gold plated stainless steel Cuban link chain. Sweatproof, waterproof, and non-tarnishing daily statement piece.",
                "base_price": 2200.00,
                "sale_price": 1800.00,
                "is_featured": False,
                "is_trending": True,
                "is_new_arrival": True,
                "variants": [
                    {
                        "sku": "CUB-GLD-18",
                        "color_name": "18k Gold",
                        "color_hex": "#D4AF37",
                        "size": "18 inch",
                        "stock_quantity": 15,
                    },
                    {
                        "sku": "CUB-GLD-20",
                        "color_name": "18k Gold",
                        "color_hex": "#D4AF37",
                        "size": "20 inch",
                        "price_override": 2500.00,
                        "stock_quantity": 10,
                    },
                    {
                        "sku": "CUB-SLV-18",
                        "color_name": "Silver Chrome",
                        "color_hex": "#E5E7EB",
                        "size": "18 inch",
                        "price_override": 1800.00,
                        "stock_quantity": 8,
                    },
                ],
            },
        ]

        for pdata in products_data:
            variants_info = pdata.pop("variants")
            prod, created = Product.objects.update_or_create(
                title=pdata["title"],
                defaults=pdata,
            )
            self.stdout.write(f"  Product: {prod.title} ({'created' if created else 'updated'})")

            for vdata in variants_info:
                variant, vcreated = ProductVariant.objects.update_or_create(
                    sku=vdata["sku"],
                    defaults={
                        "product": prod,
                        "color_name": vdata["color_name"],
                        "color_hex": vdata["color_hex"],
                        "size": vdata["size"],
                        "price_override": vdata.get("price_override"),
                        "stock_quantity": vdata["stock_quantity"],
                    },
                )
                self.stdout.write(f"    - Variant: {variant.sku} (Stock: {variant.stock_quantity})")

        self.stdout.write(self.style.SUCCESS("Catalog seeded successfully!"))
