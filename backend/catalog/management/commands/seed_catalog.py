from django.core.management.base import BaseCommand
from catalog.models import Category, Product


class Command(BaseCommand):
    help = "Seeds initial catalog categories and products for Wayaz store (Jeans, Shoes, Shirts, Bikinis)"

    def handle(self, *args, **options):
        self.stdout.write("Starting catalog seeding for Wayaz...")

        # 1. Clean up old non-apparel categories if any
        Category.objects.exclude(slug__in=["jeans", "shoes", "shirts", "bikinis"]).delete()

        # 2. The 4 Fixed Categories
        categories_data = [
            {
                "name": "Jeans",
                "slug": "jeans",
                "description": "Premium denim jeans, wide-leg, baggy cargo, and straight cuts.",
                "display_order": 1,
            },
            {
                "name": "Shoes",
                "slug": "shoes",
                "description": "Streetwear sneakers, stylish loafers, boots, and casual footwear.",
                "display_order": 2,
            },
            {
                "name": "Shirts",
                "slug": "shirts",
                "description": "Oversized graphic tees, crisp button-downs, streetwear tops, and blouses.",
                "display_order": 3,
            },
            {
                "name": "Bikinis",
                "slug": "bikinis",
                "description": "Trendy swimwear sets, two-piece sets, high-cut and triangle bikinis.",
                "display_order": 4,
            },
        ]

        categories = {}
        for cdata in categories_data:
            cat, created = Category.objects.update_or_create(
                slug=cdata["slug"],
                defaults=cdata,
            )
            categories[cdata["slug"]] = cat
            self.stdout.write(f"  Category: {cat.name} ({'created' if created else 'updated'})")

        # 3. Apparel Products (stock totals are summed from the per-size
        #    breakdowns below; there are no more variants)
        products_data = [
            {
                "title": "Vintage Washed Wide-Leg Denim Jeans",
                "category": categories["jeans"],
                "description": "Heavyweight 100% cotton denim with a relaxed wide-leg fit, mid-rise waist, and washed vintage finish.",
                "base_price": 2800.00,
                "sale_price": 2400.00,
                "variants": [
                    {"color_name": "Vintage Blue", "color_hex": "#3b82f6", "size": "30", "stock_quantity": 12},
                    {"color_name": "Vintage Blue", "color_hex": "#3b82f6", "size": "32", "stock_quantity": 18},
                    {"color_name": "Vintage Blue", "color_hex": "#3b82f6", "size": "34", "stock_quantity": 8},
                    {"color_name": "Washed Black", "color_hex": "#18181b", "size": "30", "stock_quantity": 15},
                    {"color_name": "Washed Black", "color_hex": "#18181b", "size": "32", "stock_quantity": 10},
                    {"color_name": "Washed Black", "color_hex": "#18181b", "size": "34", "stock_quantity": 3},
                ],
            },
            {
                "title": "Multi-Pocket Utility Cargo Jeans",
                "category": categories["jeans"],
                "description": "Functional streetwear cargo pants with deep tactical pockets, reinforced stitching, and relaxed straight leg.",
                "base_price": 3200.00,
                "sale_price": None,
                "variants": [
                    {"color_name": "Olive Green", "color_hex": "#4d533c", "size": "30", "stock_quantity": 10},
                    {"color_name": "Olive Green", "color_hex": "#4d533c", "size": "32", "stock_quantity": 14},
                    {"color_name": "Sand Khaki", "color_hex": "#c2b280", "size": "32", "stock_quantity": 6},
                ],
            },
            {
                "title": "Retro Chunky Platform Sneakers",
                "category": categories["shoes"],
                "description": "All-day comfort with cushioned foam midsole, breathable leather upper, and bold streetwear silhouette.",
                "base_price": 4200.00,
                "sale_price": 3600.00,
                "variants": [
                    {"color_name": "Triple White", "color_hex": "#ffffff", "size": "40", "stock_quantity": 9},
                    {"color_name": "Triple White", "color_hex": "#ffffff", "size": "41", "stock_quantity": 12},
                    {"color_name": "Triple White", "color_hex": "#ffffff", "size": "42", "stock_quantity": 15},
                    {"color_name": "Triple White", "color_hex": "#ffffff", "size": "43", "stock_quantity": 7},
                    {"color_name": "White & Crimson", "color_hex": "#dc2626", "size": "41", "stock_quantity": 8},
                    {"color_name": "White & Crimson", "color_hex": "#dc2626", "size": "42", "stock_quantity": 10},
                ],
            },
            {
                "title": "Classic Leather Penny Loafers",
                "category": categories["shoes"],
                "description": "Timeless leather loafers with stitched moccasin toe and comfortable low block heel for smart-casual styling.",
                "base_price": 4800.00,
                "sale_price": None,
                "variants": [
                    {"color_name": "Jet Black", "color_hex": "#111111", "size": "41", "stock_quantity": 5},
                    {"color_name": "Jet Black", "color_hex": "#111111", "size": "42", "stock_quantity": 8},
                    {"color_name": "Espresso Brown", "color_hex": "#4a2e18", "size": "42", "stock_quantity": 4},
                ],
            },
            {
                "title": "Heavyweight Oversized Graphic Tee",
                "category": categories["shirts"],
                "description": "240 GSM organic cotton t-shirt with ribbed crew neck, dropped shoulders, and minimal typography screenprint.",
                "base_price": 1800.00,
                "sale_price": 1500.00,
                "variants": [
                    {"color_name": "Chalk White", "color_hex": "#f5f5f5", "size": "S", "stock_quantity": 15},
                    {"color_name": "Chalk White", "color_hex": "#f5f5f5", "size": "M", "stock_quantity": 25},
                    {"color_name": "Chalk White", "color_hex": "#f5f5f5", "size": "L", "stock_quantity": 20},
                    {"color_name": "Wayaz Red", "color_hex": "#dc2626", "size": "M", "stock_quantity": 18},
                    {"color_name": "Wayaz Red", "color_hex": "#dc2626", "size": "L", "stock_quantity": 14},
                    {"color_name": "Pitch Black", "color_hex": "#09090b", "size": "M", "stock_quantity": 30},
                ],
            },
            {
                "title": "Boxy Resort Linen Short-Sleeve Shirt",
                "category": categories["shirts"],
                "description": "Breathable linen-cotton blend camp collar shirt with mother-of-pearl buttons, ideal for warm coast getaways.",
                "base_price": 2500.00,
                "sale_price": None,
                "variants": [
                    {"color_name": "Natural Cream", "color_hex": "#fef08a", "size": "M", "stock_quantity": 10},
                    {"color_name": "Natural Cream", "color_hex": "#fef08a", "size": "L", "stock_quantity": 12},
                    {"color_name": "Sky Blue", "color_hex": "#93c5fd", "size": "M", "stock_quantity": 8},
                ],
            },
            {
                "title": "Ribbed Triangle Two-Piece Bikini Set",
                "category": categories["bikinis"],
                "description": "Soft ribbed stretch swimwear fabric with adjustable neck and back ties, removable padding, and cheeky bottoms.",
                "base_price": 2200.00,
                "sale_price": 1900.00,
                "variants": [
                    {"color_name": "Scarlet Red", "color_hex": "#dc2626", "size": "S", "stock_quantity": 12},
                    {"color_name": "Scarlet Red", "color_hex": "#dc2626", "size": "M", "stock_quantity": 16},
                    {"color_name": "Scarlet Red", "color_hex": "#dc2626", "size": "L", "stock_quantity": 8},
                    {"color_name": "Classic Black", "color_hex": "#111111", "size": "S", "stock_quantity": 14},
                    {"color_name": "Classic Black", "color_hex": "#111111", "size": "M", "stock_quantity": 20},
                ],
            },
            {
                "title": "High-Cut One-Piece Cutout Swimsuit",
                "category": categories["bikinis"],
                "description": "Sleek silhouette featuring a side cutout, high leg opening, and double-lined supportive stretch fabric.",
                "base_price": 2600.00,
                "sale_price": None,
                "variants": [
                    {"color_name": "Emerald Green", "color_hex": "#047857", "size": "S", "stock_quantity": 7},
                    {"color_name": "Emerald Green", "color_hex": "#047857", "size": "M", "stock_quantity": 9},
                    {"color_name": "Midnight Black", "color_hex": "#09090b", "size": "M", "stock_quantity": 12},
                ],
            },
        ]

        for pdata in products_data:
            variants_info = pdata.pop("variants")
            # Variants are gone: collapse the per-size/color stock into a
            # single product-level stock figure, and keep the ordered
            # per-size breakdown as the product's selectable sizes.
            pdata["stock_quantity"] = sum(
                v["stock_quantity"] for v in variants_info
            )
            pdata["sizes"] = list(
                dict.fromkeys(v["size"] for v in variants_info)
            )
            product, created = Product.objects.update_or_create(
                title=pdata["title"],
                defaults=pdata,
            )
            self.stdout.write(
                f"  Product: {product.title} ({'created' if created else 'updated'}) "
                f"Stock: {product.stock_quantity}"
            )

        self.stdout.write(self.style.SUCCESS("Catalog seeded successfully for Wayaz!"))
