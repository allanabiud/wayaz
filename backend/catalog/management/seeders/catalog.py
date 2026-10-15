"""Catalog seeding stage: categories, products, and photos from examples/."""

import shutil
from decimal import Decimal
from pathlib import Path

from django.conf import settings

from accounts.models import WishlistItem
from catalog.models import Category, Product, ProductImage, ProductSize
from orders.models import Cart, CartItem, Order, OrderItem

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}

STOCK_CYCLE = [0, 5, 12, 18, 25, 30, 3, 9, 15, 22]

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
}

CATEGORIES_DATA = [
    {
        "name": "Jeans",
        "slug": "jeans",
        "description": "Premium denim jeans, wide-leg, baggy cargo, and straight cuts.",
        "icon": "jeans",
        "display_order": 1,
    },
    {
        "name": "Shoes",
        "slug": "shoes",
        "description": "Streetwear sneakers, stylish loafers, boots, and casual footwear.",
        "icon": "sneakers",
        "display_order": 2,
    },
]


def wipe_catalog():
    """Remove all demo catalog, cart, and order rows plus stored media.
    User accounts are kept."""
    WishlistItem.objects.all().delete()
    CartItem.objects.all().delete()
    Cart.objects.all().delete()
    OrderItem.objects.all().delete()
    Order.objects.all().delete()
    ProductImage.objects.all().delete()
    Product.objects.all().delete()
    Category.objects.all().delete()

    media_root = Path(settings.MEDIA_ROOT)
    for subdir in ("products", "categories"):
        target = media_root / subdir
        if target.exists():
            shutil.rmtree(target)
        target.mkdir(parents=True, exist_ok=True)


def seed_catalog(stdout, style, source=None, wipe=False):
    from django.core.management.base import CommandError

    source = Path(source) if source else Path(settings.BASE_DIR).parent / "examples"
    media_root = Path(settings.MEDIA_ROOT)

    if wipe:
        stdout.write("Wiping existing demo data...")
        wipe_catalog()

    stdout.write("Starting catalog seeding for Wayaz...")

    Category.objects.exclude(slug__in=[c["slug"] for c in CATEGORIES_DATA]).delete()

    categories = {}
    for cdata in CATEGORIES_DATA:
        cat, created = Category.objects.update_or_create(
            slug=cdata["slug"],
            defaults=cdata,
        )
        categories[cdata["slug"]] = cat
        stdout.write(f"  Category: {cat.name} ({'created' if created else 'updated'})")

    products_data = [
        {
            "title": "Vintage Washed Wide-Leg Denim Jeans",
            "category": categories["jeans"],
            "description": "Heavyweight 100% cotton denim with a relaxed wide-leg fit, mid-rise waist, and washed vintage finish.",
            "base_price": 2800.00,
            "sale_price": 2400.00,
            "variants": [
                {
                    "color_name": "Vintage Blue",
                    "color_hex": "#3b82f6",
                    "size": "30",
                    "stock_quantity": 12,
                },
                {
                    "color_name": "Vintage Blue",
                    "color_hex": "#3b82f6",
                    "size": "32",
                    "stock_quantity": 18,
                },
                {
                    "color_name": "Vintage Blue",
                    "color_hex": "#3b82f6",
                    "size": "34",
                    "stock_quantity": 8,
                },
                {
                    "color_name": "Washed Black",
                    "color_hex": "#18181b",
                    "size": "30",
                    "stock_quantity": 15,
                },
                {
                    "color_name": "Washed Black",
                    "color_hex": "#18181b",
                    "size": "32",
                    "stock_quantity": 10,
                },
                {
                    "color_name": "Washed Black",
                    "color_hex": "#18181b",
                    "size": "34",
                    "stock_quantity": 3,
                },
            ],
        },
        {
            "title": "Multi-Pocket Utility Cargo Jeans",
            "category": categories["jeans"],
            "description": "Functional streetwear cargo pants with deep tactical pockets, reinforced stitching, and relaxed straight leg.",
            "base_price": 3200.00,
            "sale_price": None,
            "variants": [
                {
                    "color_name": "Olive Green",
                    "color_hex": "#4d533c",
                    "size": "30",
                    "stock_quantity": 10,
                },
                {
                    "color_name": "Olive Green",
                    "color_hex": "#4d533c",
                    "size": "32",
                    "stock_quantity": 14,
                },
                {
                    "color_name": "Sand Khaki",
                    "color_hex": "#c2b280",
                    "size": "32",
                    "stock_quantity": 6,
                },
            ],
        },
        {
            "title": "Retro Chunky Platform Sneakers",
            "category": categories["shoes"],
            "description": "All-day comfort with cushioned foam midsole, breathable leather upper, and bold streetwear silhouette.",
            "base_price": 4200.00,
            "sale_price": 3600.00,
            "variants": [
                {
                    "color_name": "Triple White",
                    "color_hex": "#ffffff",
                    "size": "40",
                    "stock_quantity": 9,
                },
                {
                    "color_name": "Triple White",
                    "color_hex": "#ffffff",
                    "size": "41",
                    "stock_quantity": 12,
                },
                {
                    "color_name": "Triple White",
                    "color_hex": "#ffffff",
                    "size": "42",
                    "stock_quantity": 15,
                },
                {
                    "color_name": "Triple White",
                    "color_hex": "#ffffff",
                    "size": "43",
                    "stock_quantity": 7,
                },
                {
                    "color_name": "White & Crimson",
                    "color_hex": "#dc2626",
                    "size": "41",
                    "stock_quantity": 8,
                },
                {
                    "color_name": "White & Crimson",
                    "color_hex": "#dc2626",
                    "size": "42",
                    "stock_quantity": 10,
                },
            ],
        },
        {
            "title": "Classic Leather Penny Loafers",
            "category": categories["shoes"],
            "description": "Timeless leather loafers with stitched moccasin toe and comfortable low block heel for smart-casual styling.",
            "base_price": 4800.00,
            "sale_price": None,
            "variants": [
                {
                    "color_name": "Jet Black",
                    "color_hex": "#111111",
                    "size": "41",
                    "stock_quantity": 5,
                },
                {
                    "color_name": "Jet Black",
                    "color_hex": "#111111",
                    "size": "42",
                    "stock_quantity": 8,
                },
                {
                    "color_name": "Espresso Brown",
                    "color_hex": "#4a2e18",
                    "size": "42",
                    "stock_quantity": 4,
                },
            ],
        },
    ]

    curated_titles = {slug: [] for slug in categories}

    for pdata in products_data:
        variants_info = pdata.pop("variants")
        # Colors are decorative; stock is what matters, summed per size.
        per_size = {}
        for variant in variants_info:
            per_size[variant["size"]] = (
                per_size.get(variant["size"], 0) + variant["stock_quantity"]
            )
        product, created = Product.objects.update_or_create(
            title=pdata["title"],
            defaults=pdata,
        )
        ProductSize.objects.filter(product=product).delete()
        ProductSize.objects.bulk_create(
            [
                ProductSize(product=product, size=size, quantity=qty, display_order=i)
                for i, (size, qty) in enumerate(per_size.items())
            ]
        )
        curated_titles[pdata["category"].slug].append(product.title)
        stdout.write(
            f"  Product: {product.title} ({'created' if created else 'updated'}) "
            f"Stock: {product.total_stock}"
        )

    attached = 0
    for slug, category in categories.items():
        folder = source / slug
        if not folder.is_dir():
            stdout.write(
                style.WARNING(
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
            stdout.write(
                style.WARNING(f"  [{slug}] {folder} has no usable images - skipping.")
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

        for i in range(to_generate):
            color = colors[(i // len(styles)) % len(colors)]
            style_name = styles[i % len(styles)]
            title = f"{color} {style_name}"
            base_price = plan["base_start"] + (i % 6) * plan["step"]
            sale_price = base_price - plan["sale_drop"] if i % 3 == 0 else None
            # Every fifth item is one-size so both card flows appear.
            sizes = [] if i % 5 == 4 else plan["sizes"]
            stock = STOCK_CYCLE[i % len(STOCK_CYCLE)]
            product, _ = Product.objects.update_or_create(
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
                },
            )
            ProductSize.objects.filter(product=product).delete()
            if not sizes:
                ProductSize.objects.create(product=product, size="", quantity=stock)
            else:
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

        curated_qs = [Product.objects.get(title=t) for t in curated]
        generated_qs = list(
            Product.objects.filter(category=category)
            .exclude(title__in=curated)
            .order_by("id")
        )
        products = curated_qs + generated_qs

        dest_dir = media_root / "products" / slug
        dest_dir.mkdir(parents=True, exist_ok=True)

        for product, image_path in zip(products, images, strict=False):
            dest = dest_dir / image_path.name
            shutil.copy2(image_path, dest)
            ProductImage.objects.filter(product=product).delete()
            ProductImage.objects.create(
                product=product,
                image=f"products/{slug}/{image_path.name}",
                alt_text=product.title,
                is_primary=True,
                display_order=0,
            )
            attached += 1

        stdout.write(
            f"  [{slug}] {len(images)} photos -> {min(len(products), len(images))} "
            f"products ({len(curated)} curated, "
            f"{max(0, len(images) - len(curated))} generated)"
        )

    total_products = Product.objects.count()
    stdout.write(
        style.SUCCESS(
            f"Catalog seeded: {total_products} products, "
            f"{attached} product photos attached from {source}."
        )
    )
