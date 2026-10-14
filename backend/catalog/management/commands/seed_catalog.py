"""Seed the Wayaz catalog: the 4 fixed categories, curated products, and
product photos from the repo's ``examples/`` directory.

Re-runnable:
- categories and products are updated in place (``update_or_create`` by
  slug/title), so existing accounts, orders, and reviews keep working;
- photos from ``examples/<category>/`` are copied into
  ``media/products/<category>/`` and attached as each product's primary
  image (curated products get photos first, then generated products are
  added until every photo in the folder is used, one photo per product);
- categories without an ``examples/<slug>/`` folder are skipped with a
  warning, so ``shirts/`` or ``bikinis/`` photos can be dropped in later
  without any code change.
"""

import shutil
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from catalog.models import Category, Product, ProductImage

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}

# Cycles sold-out, low-stock (amber banner), and healthy stock levels so
# every storefront card state gets exercised.
STOCK_CYCLE = [0, 5, 12, 18, 25, 30, 3, 9, 15, 22]

# Name parts for the products generated to consume the remaining photos.
# Style cycles fastest, color slowest, so every (color, style) pair stays
# unique within a category.
JEAN_STYLES = [
    "Wide-Leg Jeans",
    "Straight Leg Jeans",
    "Slim Fit Jeans",
    "Baggy Cargo Jeans",
    "Bootcut Jeans",
    "Tapered Jeans",
    "Boyfriend Jeans",
    "Mom Jeans",
    "Flared Jeans",
]
JEAN_WASHES = [
    "Vintage Washed",
    "Dark Indigo",
    "Stone Washed",
    "Light Acid Wash",
    "Classic Blue",
]
SHOE_STYLES = [
    "Chunky Platform Sneakers",
    "Low-Top Court Sneakers",
    "Leather Penny Loafers",
    "Chelsea Boots",
    "Canvas High-Tops",
    "Retro Running Trainers",
    "Suede Desert Boots",
    "Slip-On Sneakers",
    "Lace-Up Derby Shoes",
]
SHOE_COLORS = ["Triple White", "Jet Black", "Navy Blue", "Tan", "Crimson"]
SHIRT_STYLES = [
    "Oversized Graphic Tee",
    "Button-Down Oxford Shirt",
    "Camp Collar Resort Shirt",
    "Boxy Linen Shirt",
    "Ribbed Knit Top",
    "Relaxed Flannel Shirt",
]
SHIRT_COLORS = ["Chalk White", "Pitch Black", "Wayaz Red", "Sky Blue", "Natural Cream"]
BIKINI_STYLES = [
    "Triangle Two-Piece Set",
    "High-Cut One-Piece",
    "Bandeau Bikini Set",
    "Wrap-Front Swimsuit",
    "Halter Neck Set",
    "Boyshort Swim Set",
]
BIKINI_COLORS = ["Scarlet Red", "Classic Black", "Emerald Green", "Sunset Orange", "Ivory"]

GEN_PLANS = {
    "jeans": {
        "styles": JEAN_STYLES,
        "colors": JEAN_WASHES,
        "sizes": ["26", "28", "30", "32", "34"],
        "base_start": Decimal("2200"),
        "step": Decimal("300"),
        "sale_drop": Decimal("400"),
        "extras": [
            "Belt loops, five-pocket construction, and a zip fly.",
            "Distressed hems and a relaxed, streetwear-ready silhouette.",
            "Stretch cotton for all-day comfort that keeps its shape.",
        ],
        "description": (
            "{title} crafted from heavyweight denim in a {color} "
            "finish. Comfortable fit with a mid-rise waist and "
            "reinforced stitching for everyday wear. {extra}"
        ),
    },
    "shoes": {
        "styles": SHOE_STYLES,
        "colors": SHOE_COLORS,
        "sizes": ["39", "40", "41", "42", "43"],
        "base_start": Decimal("2800"),
        "step": Decimal("450"),
        "sale_drop": Decimal("600"),
        "extras": [
            "Padded collar and cushioned insole for all-day wear.",
            "Bold streetwear silhouette with a grip-ready outsole.",
            "Breathable upper that pairs with denim or shorts.",
        ],
        "description": (
            "{title} with a cushioned insole, breathable upper, and "
            "durable non-slip outsole. Built for all-day comfort on "
            "the street. {extra}"
        ),
    },
    "shirts": {
        "styles": SHIRT_STYLES,
        "colors": SHIRT_COLORS,
        "sizes": ["S", "M", "L", "XL"],
        "base_start": Decimal("1500"),
        "step": Decimal("250"),
        "sale_drop": Decimal("300"),
        "extras": [
            "Soft-touch fabric with a relaxed, everyday fit.",
            "Streetwear-ready cut that layers easily over tees.",
            "Durable stitching and a clean finish throughout.",
        ],
        "description": (
            "{title} in a {color} colorway. Easy, relaxed fit with a "
            "soft hand-feel and reinforced seams for repeat wear. "
            "{extra}"
        ),
    },
    "bikinis": {
        "styles": BIKINI_STYLES,
        "colors": BIKINI_COLORS,
        "sizes": ["S", "M", "L"],
        "base_start": Decimal("1900"),
        "step": Decimal("250"),
        "sale_drop": Decimal("300"),
        "extras": [
            "Quick-dry stretch fabric with adjustable ties.",
            "Removable padding and a supportive, secure fit.",
            "Double-lined construction that keeps its shape.",
        ],
        "description": (
            "{title} in a {color} colorway. Flattering stretch fit "
            "with secure support built for pool days and the coast. "
            "{extra}"
        ),
    },
}


class Command(BaseCommand):
    help = (
        "Seed the 4 fixed categories and curated products, then attach "
        "photos from examples/<category>/ (generating extra products so "
        "every photo becomes its own listing). Safe to re-run."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--source",
            type=str,
            default=None,
            help=(
                "Folder containing category image subfolders "
                "(default: <repo root>/examples)."
            ),
        )

    def handle(self, *args, **options):
        source = (
            Path(options["source"])
            if options["source"]
            else Path(settings.BASE_DIR).parent / "examples"
        )
        media_root = Path(settings.MEDIA_ROOT)

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

        # Curated titles per category, in declaration order; these products
        # receive photos before any generated ones.
        curated_titles = {slug: [] for slug in categories}

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
            curated_titles[pdata["category"].slug].append(product.title)
            self.stdout.write(
                f"  Product: {product.title} ({'created' if created else 'updated'}) "
                f"Stock: {product.stock_quantity}"
            )

        # 4. Attach photos from examples/<slug>/, one photo per product.
        #    Curated products come first; generated products are added until
        #    every photo in the folder has a home.
        attached = 0
        for slug, category in categories.items():
            folder = source / slug
            if not folder.is_dir():
                self.stdout.write(
                    self.style.WARNING(
                        f"  [{slug}] No image folder at {folder} - "
                        f"skipping photos (drop some in later and re-run)."
                    )
                )
                continue

            images = sorted(
                path
                for path in folder.iterdir()
                if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
            )
            if not images:
                self.stdout.write(
                    self.style.WARNING(f"  [{slug}] {folder} has no usable images - skipping.")
                )
                continue

            plan = GEN_PLANS[slug]
            styles, colors = plan["styles"], plan["colors"]
            capacity = len(styles) * len(colors)
            curated = curated_titles[slug]
            to_generate = max(0, len(images) - len(curated))
            if to_generate > capacity:
                raise CommandError(
                    f"[{slug}] {len(images)} photos but only {capacity} unique "
                    f"generated names available - add styles/colors or fewer photos."
                )

            # Generate the extra listings needed to consume every photo.
            for i in range(to_generate):
                color = colors[(i // len(styles)) % len(colors)]
                style = styles[i % len(styles)]
                title = f"{color} {style}"
                base_price = plan["base_start"] + (i % 6) * plan["step"]
                sale_price = (
                    base_price - plan["sale_drop"] if i % 3 == 0 else None
                )
                # Every fifth generated item is one-size so both card flows
                # appear ("Add to Cart" directly vs "Select size").
                sizes = [] if i % 5 == 4 else plan["sizes"]
                stock = STOCK_CYCLE[i % len(STOCK_CYCLE)]
                Product.objects.update_or_create(
                    title=title,
                    defaults={
                        "category": category,
                        "description": plan["description"].format(
                            title=title,
                            color=color.lower(),
                            extra=plan["extras"][i % len(plan["extras"])],
                        ),
                        "base_price": base_price,
                        "sale_price": sale_price,
                        "stock_quantity": stock,
                        "sizes": sizes,
                    },
                )

            # Ordered product list: curated first (declaration order), then
            # everything else oldest-first, so re-runs keep assignments stable.
            curated_qs = [
                Product.objects.get(title=t) for t in curated
            ]
            generated_qs = list(
                Product.objects.filter(category=category)
                .exclude(title__in=curated)
                .order_by("id")
            )
            products = curated_qs + generated_qs

            dest_dir = media_root / "products" / slug
            dest_dir.mkdir(parents=True, exist_ok=True)

            for product, image_path in zip(products, images):
                dest = dest_dir / image_path.name
                shutil.copy2(image_path, dest)
                # Re-runs: clear prior images so each product has exactly one.
                ProductImage.objects.filter(product=product).delete()
                ProductImage.objects.create(
                    product=product,
                    image=f"products/{slug}/{image_path.name}",
                    alt_text=product.title,
                    is_primary=True,
                    display_order=0,
                )
                attached += 1

            self.stdout.write(
                f"  [{slug}] {len(images)} photos -> {min(len(products), len(images))} "
                f"products ({len(curated)} curated, "
                f"{max(0, len(images) - len(curated))} generated)"
            )

        total_products = Product.objects.count()
        self.stdout.write(
            self.style.SUCCESS(
                f"Catalog seeded: {total_products} products, "
                f"{attached} product photos attached from {source}."
            )
        )
