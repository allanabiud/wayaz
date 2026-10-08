import shutil
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from accounts.models import WishlistItem
from catalog.models import Category, Product, ProductImage
from orders.models import Cart, CartItem, Order, OrderItem

# Deterministic name parts - style cycles fastest, color/wash slowest, so
# every (color, style) pair stays unique up to 45 products per category.
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

JEAN_SIZES = ["26", "28", "30", "32", "34"]
SHOE_SIZES = ["39", "40", "41", "42", "43"]

# Cycles sold-out, low-stock (amber banner), and healthy stock levels so
# every storefront card state gets exercised.
STOCK_CYCLE = [0, 5, 12, 18, 25, 30, 3, 9, 15, 22]

JEAN_EXTRAS = [
    "Belt loops, five-pocket construction, and a zip fly.",
    "Distressed hems and a relaxed, streetwear-ready silhouette.",
    "Stretch cotton for all-day comfort that keeps its shape.",
]
SHOE_EXTRAS = [
    "Padded collar and cushioned insole for all-day wear.",
    "Bold streetwear silhouette with a grip-ready outsole.",
    "Breathable upper that pairs with denim or shorts.",
]

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


class Command(BaseCommand):
    help = (
        "Wipe all demo catalog/cart/order data and rebuild the store with "
        "generated Jeans and Shoes products using images from examples/. "
        "User accounts are kept."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--count",
            type=int,
            default=30,
            help="Products (and images) per category (default: 30).",
        )
        parser.add_argument(
            "--source",
            type=str,
            default=None,
            help=(
                "Folder containing jeans/ and shoes/ image subfolders "
                "(default: <repo root>/examples)."
            ),
        )

    def handle(self, *args, **options):
        count = options["count"]
        if count < 1:
            raise CommandError("--count must be at least 1.")
        if count > len(JEAN_STYLES) * len(JEAN_WASHES):
            raise CommandError(
                "--count cannot exceed 45 unique product names per category."
            )

        source = (
            Path(options["source"])
            if options["source"]
            else Path(settings.BASE_DIR).parent / "examples"
        )
        media_root = Path(settings.MEDIA_ROOT)

        # 1. Wipe database rows (user accounts and addresses are kept).
        self.stdout.write("Wiping existing demo data...")
        WishlistItem.objects.all().delete()
        CartItem.objects.all().delete()
        Cart.objects.all().delete()
        OrderItem.objects.all().delete()
        Order.objects.all().delete()
        ProductImage.objects.all().delete()
        Product.objects.all().delete()
        Category.objects.all().delete()

        # 2. Wipe stored product/category media so re-runs never orphan files.
        for subdir in ("products", "categories"):
            target = media_root / subdir
            if target.exists():
                shutil.rmtree(target)
            target.mkdir(parents=True, exist_ok=True)

        # 3. The two categories present in the example photos.
        jeans = Category.objects.create(
            name="Jeans",
            slug="jeans",
            description=(
                "Premium denim jeans, wide-leg, baggy cargo, and straight cuts."
            ),
            display_order=1,
        )
        shoes = Category.objects.create(
            name="Shoes",
            slug="shoes",
            description=(
                "Streetwear sneakers, stylish loafers, boots, and casual footwear."
            ),
            display_order=2,
        )

        plans = [
            {
                "slug": "jeans",
                "category": jeans,
                "styles": JEAN_STYLES,
                "color_words": JEAN_WASHES,
                "sizes": JEAN_SIZES,
                "base_start": Decimal("2200"),
                "step": Decimal("300"),
                "sale_drop": Decimal("400"),
                "extras": JEAN_EXTRAS,
                "description": (
                    "{title} crafted from heavyweight denim in a {color} "
                    "finish. Comfortable fit with a mid-rise waist and "
                    "reinforced stitching for everyday wear. {extra}"
                ),
            },
            {
                "slug": "shoes",
                "category": shoes,
                "styles": SHOE_STYLES,
                "color_words": SHOE_COLORS,
                "sizes": SHOE_SIZES,
                "base_start": Decimal("2800"),
                "step": Decimal("450"),
                "sale_drop": Decimal("600"),
                "extras": SHOE_EXTRAS,
                "description": (
                    "{title} with a cushioned insole, breathable upper, and "
                    "durable non-slip outsole. Built for all-day comfort on "
                    "the street. {extra}"
                ),
            },
        ]

        seeded = 0
        for plan in plans:
            slug = plan["slug"]
            folder = source / slug
            if not folder.is_dir():
                raise CommandError(f"Missing image folder: {folder}")

            images = sorted(
                path
                for path in folder.iterdir()
                if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
            )
            if len(images) < count:
                raise CommandError(
                    f"Only {len(images)} usable images in {folder}; need {count}."
                )
            images = images[:count]

            dest_dir = media_root / "products" / slug
            dest_dir.mkdir(parents=True, exist_ok=True)

            styles = plan["styles"]
            for i, image_path in enumerate(images):
                color = plan["color_words"][(i // len(styles)) % len(plan["color_words"])]
                style = styles[i % len(styles)]
                title = f"{color} {style}"

                base_price = plan["base_start"] + (i % 6) * plan["step"]
                # Every third item goes on sale so the storefront shows
                # sale badges and struck-through prices.
                sale_price = base_price - plan["sale_drop"] if i % 3 == 0 else None
                # Every fifth item is one-size so both card flows appear
                # ("Add to Cart" directly vs "Select size").
                sizes = [] if i % 5 == 4 else plan["sizes"]
                stock = STOCK_CYCLE[i % len(STOCK_CYCLE)]

                product = Product.objects.create(
                    title=title,
                    category=plan["category"],
                    description=plan["description"].format(
                        title=title,
                        color=color.lower(),
                        extra=plan["extras"][i % len(plan["extras"])],
                    ),
                    base_price=base_price,
                    sale_price=sale_price,
                    stock_quantity=stock,
                    sizes=sizes,
                )

                dest = dest_dir / image_path.name
                shutil.copy2(image_path, dest)
                ProductImage.objects.create(
                    product=product,
                    image=f"products/{slug}/{image_path.name}",
                    alt_text=title,
                    is_primary=True,
                    display_order=0,
                )
                seeded += 1
                self.stdout.write(
                    f"  [{slug}] {title} - Ksh {base_price:.0f}"
                    + (f" (was {base_price - sale_price:.0f} off)" if sale_price else "")
                    + f", stock {stock}, sizes {','.join(sizes) or 'one-size'}"
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {seeded} products ({count} Jeans + {count} Shoes) "
                f"with {seeded} images."
            )
        )
