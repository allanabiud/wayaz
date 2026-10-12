"""Seed the shop: demo customers, addresses, order history, carts,
wishlist entries, and product reviews.

Runs on top of an existing catalog (``seed_catalog`` / ``seed_demo``) and
never touches products or categories, so it is safe to re-run. Previously
seeded demo data (identified by the ``@wayaz.demo`` email domain and the
``guest-demo-`` id/session prefix) is wiped first, keeping any real accounts
and their data intact.

Order timestamps are backdated across the last ~90 days so the admin
dashboard KPIs and the analytics charts (Today / This Week / This Month /
30d / All Time) all have realistic data to plot. Product stock levels are
left exactly as the catalog seeds set them, so the storefront keeps its
curated sold-out / low-stock states.
"""

import random
import uuid
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from accounts.models import Address, WishlistItem
from catalog.models import Product, ProductReview
from orders.models import Cart, CartItem, Order, OrderItem

User = get_user_model()

DEMO_EMAIL_DOMAIN = "@wayaz.demo"
GUEST_PREFIX = "guest-demo-"

# (first_name, last_name) pairs - usernames/emails are derived from these.
CUSTOMER_NAMES = [
    ("Amina", "Wanjiku"),
    ("Brian", "Ochieng"),
    ("Cynthia", "Njeri"),
    ("Dennis", "Kiprop"),
    ("Esther", "Chebet"),
    ("Felix", "Mutua"),
    ("Grace", "Akinyi"),
    ("Humphrey", "Maina"),
    ("Irene", "Wafula"),
    ("Joseph", "Kariuki"),
    ("Kevin", "Otieno"),
    ("Lilian", "Achieng"),
    ("Mercy", "Wairimu"),
    ("Nicholas", "Rotich"),
    ("Olivia", "Adhiambo"),
    ("Peter", "Ndungu"),
    ("Quincy", "Cherono"),
    ("Rachel", "Mutiso"),
    ("Samuel", "Barasa"),
    ("Terry", "Chebet"),
    ("Victor", "Omondi"),
    ("Wanjiru", "Kamau"),
    ("Yusuf", "Hassan"),
    ("Zawadi", "Mwende"),
]

# (county, town) delivery destinations, roughly weighted to Nairobi.
DESTINATIONS = [
    ("Nairobi", "Westlands"),
    ("Nairobi", "Kilimani"),
    ("Nairobi", "South B"),
    ("Nairobi", "Kasarani"),
    ("Nairobi", "Embakasi"),
    ("Kiambu", "Ruaka"),
    ("Kiambu", "Thika"),
    ("Mombasa", "Nyali"),
    ("Mombasa", "Bamburi"),
    ("Kisumu", "Milimani"),
    ("Nakuru", "Naivasha"),
    ("Uasin Gishu", "Eldoret"),
    ("Machakos", "Machakos Town"),
    ("Meru", "Meru Town"),
]

STREETS = [
    "Delta Towers, 4th Floor",
    "Kilimani Court, House 12",
    "Laikipia Road, Plot 7",
    "Riverbank Suites, Apt 3B",
    "Ngong Road, View Park",
    "Milimani Estate, Off Oginga Odinga Street",
    "Nyali Links, Block C",
    "Kakahira Terrace, House 21",
    "Enterprise Road, Warehouse 5",
    "Thika Superhighway, Gardens 8",
]

PHONE_PREFIXES = ["0712", "0722", "0733", "0701", "0710", "0748", "0110"]

# Weighted toward 4-5 stars (a happy fashion storefront), with a few 3s.
RATING_WEIGHTS = [1, 2, 5, 8, 6]  # indexes 0..4 => 1..5 stars


def pick_status(days_ago: int, rng: random.Random) -> str:
    """Older orders are mostly delivered; recent ones still in flight."""
    if days_ago <= 3:
        return rng.choices(
            ["PROCESSING", "CONFIRMED", "CANCELLED"], weights=[5, 4, 1]
        )[0]
    if days_ago <= 14:
        return rng.choices(
            ["CONFIRMED", "DELIVERED", "CANCELLED"], weights=[3, 6, 1]
        )[0]
    return rng.choices(["DELIVERED", "CANCELLED"], weights=[9, 1])[0]


def payment_status_for(status: str, method: str) -> str:
    if status == "CANCELLED":
        return "FAILED"
    if status == "DELIVERED":
        return "PAID"
    if status == "CONFIRMED":
        return "PAID" if method == "mpesa" else "PENDING"
    return "PENDING"  # PROCESSING - awaiting confirmation / collection


class Command(BaseCommand):
    help = (
        "Seed demo customers, addresses, order history, carts, wishlist, and "
        "reviews on top of the existing catalog. Products are never modified."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--customers",
            type=int,
            default=20,
            help="Number of demo customers to create (default: 20, max: 24).",
        )
        parser.add_argument(
            "--max-orders",
            type=int,
            default=6,
            help="Upper bound of orders per customer (default: 6).",
        )
        parser.add_argument(
            "--seed",
            type=int,
            default=42,
            help="Random seed for reproducible data (default: 42).",
        )
        parser.add_argument(
            "--password",
            type=str,
            default="wayaz1234",
            help="Password for every demo customer (default: wayaz1234).",
        )
        parser.add_argument(
            "--admin-password",
            type=str,
            default="admin1234",
            help="Password for the demo admin if one is created.",
        )
        parser.add_argument(
            "--skip-admin",
            action="store_true",
            help="Do not create a demo admin account.",
        )

    def handle(self, *args, **options):
        customers_count = options["customers"]
        if customers_count < 1 or customers_count > len(CUSTOMER_NAMES):
            raise CommandError(
                f"--customers must be between 1 and {len(CUSTOMER_NAMES)}."
            )

        products = list(Product.objects.prefetch_related("images"))
        if not products:
            raise CommandError(
                "No products found. Run seed_catalog (or seed_demo) first."
            )

        rng = random.Random(options["seed"])
        now = timezone.now()

        # 1. Wipe previously seeded shop data; real accounts stay untouched.
        self.stdout.write("Wiping previously seeded shop data...")
        demo_users = User.objects.filter(email__endswith=DEMO_EMAIL_DOMAIN)
        Order.objects.filter(user__in=demo_users).delete()
        Order.objects.filter(guest_id__startswith=GUEST_PREFIX).delete()
        Cart.objects.filter(user__in=demo_users).delete()
        Cart.objects.filter(session_key__startswith=GUEST_PREFIX).delete()
        # Cascades addresses, wishlist items, and reviews along with them.
        deleted = demo_users.delete()[0]
        self.stdout.write(f"  Removed {deleted} rows (users + related shop data).")

        # 2. A demo admin so the dashboard is reachable, if there isn't one.
        if not options["skip_admin"] and not User.objects.filter(
            is_superuser=True
        ).exists():
            User.objects.create_superuser(
                username="admin",
                email=f"admin{DEMO_EMAIL_DOMAIN}",
                password=options["admin_password"],
                first_name="Wayaz",
                last_name="Admin",
                role="admin",
            )
            self.stdout.write(
                "  Created demo admin: admin / "
                f"{options['admin_password']}"
            )

        # 3. Customers, each with a default shipping address.
        customers = []
        for first, last in CUSTOMER_NAMES[:customers_count]:
            username = f"{first.lower()}.{last.lower()}"
            user = User.objects.create_user(
                username=username,
                email=f"{username}{DEMO_EMAIL_DOMAIN}",
                password=options["password"],
                first_name=first,
                last_name=last,
                phone_number=self._phone(rng),
                role="customer",
            )
            customers.append(user)

        self.stdout.write(f"  Created {len(customers)} demo customers.")

        for user in customers:
            # 1-3 addresses; the first is the default checkout destination.
            for idx in range(rng.randint(1, 3)):
                county, town = rng.choice(DESTINATIONS)
                Address.objects.create(
                    user=user,
                    full_name=user.display_name,
                    phone_number=user.phone_number or self._phone(rng),
                    county=county,
                    town=town,
                    street_address=rng.choice(STREETS),
                    is_default=idx == 0,
                )

        # 4. Order history spread across the last ~90 days.
        order_total = 0
        for user in customers:
            # A few customers are repeat shoppers so "returning rate" shows.
            count = rng.choices(
                range(1, options["max_orders"] + 1),
                weights=[6, 5, 4, 3, 2, 1][: options["max_orders"]],
            )[0]
            for _ in range(count):
                if self._make_order(user, products, rng, now):
                    order_total += 1

        # A handful of guest checkouts so the guest path is represented.
        for _ in range(rng.randint(3, 6)):
            if self._make_order(None, products, rng, now):
                order_total += 1

        self.stdout.write(f"  Created {order_total} orders (backdated ~90 days).")

        # 5. Active carts - a few signed-in shoppers plus one guest.
        for user in rng.sample(customers, k=min(4, len(customers))):
            self._make_cart(user=user, session_key="", products=products, rng=rng)
        self._make_cart(
            user=None,
            session_key=f"{GUEST_PREFIX}{uuid.uuid4().hex[:12]}",
            products=products,
            rng=rng,
        )
        self.stdout.write("  Created 5 active carts (4 account, 1 guest).")

        # 6. Wishlist saves and product reviews.
        wishlist_rows = review_rows = 0
        for user in customers:
            wish_count = min(rng.randint(2, 8), len(products))
            for product in rng.sample(products, k=wish_count):
                _, created = WishlistItem.objects.get_or_create(
                    user=user, product=product
                )
                wishlist_rows += int(created)

            review_count = min(rng.randint(3, 9), len(products))
            for product in rng.sample(products, k=review_count):
                rating = rng.choices(range(1, 6), weights=RATING_WEIGHTS)[0]
                _, created = ProductReview.objects.get_or_create(
                    user=user,
                    product=product,
                    defaults={"rating": rating},
                )
                review_rows += int(created)

        self.stdout.write(
            f"  Created {wishlist_rows} wishlist saves and {review_rows} reviews."
        )

        self.stdout.write(
            self.style.SUCCESS(
                "\nShop seeded. Demo customer login: "
                f"{customers[0].username} / {options['password']}"
            )
        )

    # ---- helpers ---------------------------------------------------------

    @staticmethod
    def _phone(rng: random.Random) -> str:
        return f"{rng.choice(PHONE_PREFIXES)}{rng.randint(0, 999999):06d}"

    def _make_order(self, user, products, rng, now) -> bool:
        """Create one backdated order with snapshot line items. Returns True
        when an order was written."""
        lines = rng.sample(products, k=min(rng.randint(1, 4), len(products)))
        items = []
        subtotal = Decimal("0.00")
        for product in lines:
            quantity = rng.randint(1, 3)
            unit_price = product.current_price
            items.append((product, quantity, unit_price))
            subtotal += unit_price * quantity

        # Age the order, but always keep a few landing today so the hourly
        # "Today" chart has points. Weights: recent, mid, and older history.
        days_ago = rng.choices(
            [rng.randint(0, 6), rng.randint(7, 30), rng.randint(31, 90)],
            weights=[2, 3, 5],
        )[0]
        status = pick_status(days_ago, rng)
        method = rng.choice(["cod", "mpesa"])

        created_at = self._timestamp(now, days_ago, rng)
        county, town = rng.choice(DESTINATIONS)
        guest_id = (
            "" if user else f"{GUEST_PREFIX}{uuid.uuid4().hex[:12]}"
        )

        discount = (
            (subtotal * Decimal("0.10")).quantize(Decimal("0.01"))
            if rng.random() < 0.2
            else Decimal("0.00")
        )

        order = Order.objects.create(
            user=user,
            guest_id=guest_id,
            email=(
                user.email
                if user
                else f"guest{rng.randint(1000, 9999)}@example.com"
            ),
            phone_number=(
                user.phone_number if user and user.phone_number else self._phone(rng)
            ),
            shipping_name=user.display_name if user else "Guest Shopper",
            county=county,
            town=town,
            street_address=rng.choice(STREETS),
            delivery_method=self._delivery_zone(county, rng),
            shipping_fee=Decimal("0.00"),
            subtotal=subtotal,
            discount_amount=discount,
            total_amount=subtotal - discount,
            status=status,
            payment_method=method,
            payment_status=payment_status_for(status, method),
        )

        for product, quantity, unit_price in items:
            OrderItem.objects.create(
                order=order,
                product=product,
                product_title=product.title,
                unit_price=unit_price,
                quantity=quantity,
            )

        # created_at/updated_at are auto_now fields, so backdate explicitly.
        Order.objects.filter(pk=order.pk).update(
            created_at=created_at,
            updated_at=created_at + timedelta(hours=rng.randint(1, 48)),
        )
        return True

    def _make_cart(self, user, session_key, products, rng):
        cart = Cart.objects.create(user=user, session_key=session_key or None)
        for product in rng.sample(products, k=min(rng.randint(2, 4), len(products))):
            CartItem.objects.create(
                cart=cart,
                product=product,
                size=rng.choice(product.sizes) if product.sizes else "",
                quantity=rng.randint(1, 2),
            )
        return cart

    @staticmethod
    def _timestamp(now, days_ago: int, rng: random.Random):
        """A backdated timestamp that never lands in the future."""
        hour = rng.randint(8, 21)
        if days_ago == 0:
            hour = rng.randint(0, max(0, now.hour - 1)) or 9
        return (now - timedelta(days=days_ago)).replace(
            hour=hour,
            minute=rng.randint(0, 59),
            second=0,
            microsecond=0,
        )

    @staticmethod
    def _delivery_zone(county: str, rng: random.Random) -> str:
        if county == "Nairobi":
            return rng.choice(["nairobi_doorstep", "nairobi_cbd_pickup", "free"])
        return rng.choice(["upcountry_courier", "free"])
