"""Demo shop activity seeded on top of the catalog: customers, orders,
carts, wishlist, reviews, and coupons. Never touches products."""

import random
import uuid
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone

from accounts.models import Address, WishlistItem
from catalog.models import Product, ProductReview
from orders.models import Cart, CartItem, Coupon, Order, OrderItem

User = get_user_model()

DEMO_EMAIL_DOMAIN = "@wayaz.demo"
GUEST_PREFIX = "guest-demo-"

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

RATING_WEIGHTS = [1, 2, 5, 8, 6]

REVIEW_COMMENTS = {
    5: [
        "Exactly as pictured and the fit is spot on. Delivered the next day.",
        "Second one I've ordered - the quality is consistent and the size chart is accurate.",
        "Fabric is thick and the stitching held up after several washes. Worth it.",
        "Messaged them on WhatsApp and it arrived the same afternoon. Very happy.",
    ],
    4: [
        "Good quality overall, though it runs slightly large - size down if you're between sizes.",
        "Looks just like the photos. Took a day longer than expected but fine.",
        "Comfortable and well made. Would have been five stars for the price.",
    ],
    3: [
        "Decent for the money, but the colour is a little lighter than shown.",
        "Fine, though the fit through the hips is tighter than I expected.",
        "As described - nothing special, but no complaints either.",
    ],
    2: [
        "Arrived with a loose thread along the seam. Support was slow to respond.",
        "Sizing was off and returning it was a hassle. Expected better.",
    ],
    1: [
        "Not the same fabric as described - sent it back.",
        "Ordered two, one arrived damaged. Still waiting on a refund.",
    ],
}

DEMO_COUPONS = [
    (
        "WELCOME10",
        Coupon.DiscountType.PERCENT,
        "10",
        True,
        Coupon.Audience.FIRST_ORDER,
        True,
    ),
    ("GUEST5", Coupon.DiscountType.PERCENT, "5", True, Coupon.Audience.GUESTS, True),
    (
        "TAKE500",
        Coupon.DiscountType.FIXED,
        "500",
        True,
        Coupon.Audience.EVERYONE,
        False,
    ),
    (
        "ENDOFSEASON",
        Coupon.DiscountType.PERCENT,
        "25",
        False,
        Coupon.Audience.EVERYONE,
        False,
    ),
]


def pick_status(days_ago: int, rng: random.Random) -> str:
    if days_ago <= 3:
        return rng.choices(["PROCESSING", "CONFIRMED", "CANCELLED"], weights=[5, 4, 1])[
            0
        ]
    if days_ago <= 14:
        return rng.choices(["CONFIRMED", "DELIVERED", "CANCELLED"], weights=[3, 6, 1])[
            0
        ]
    return rng.choices(["DELIVERED", "CANCELLED"], weights=[9, 1])[0]


def payment_status_for(status: str, method: str) -> str:
    if status == "CANCELLED":
        return "FAILED"
    if status == "DELIVERED":
        return "PAID"
    if status == "CONFIRMED":
        return "PAID" if method == "mpesa" else "PENDING"
    return "PENDING"


def _phone(rng: random.Random) -> str:
    return f"{rng.choice(PHONE_PREFIXES)}{rng.randint(0, 999999):06d}"


def _timestamp(now, days_ago: int, rng: random.Random):
    hour = rng.randint(8, 21)
    if days_ago == 0:
        hour = rng.randint(0, max(0, now.hour - 1)) or 9
    return (now - timedelta(days=days_ago)).replace(
        hour=hour,
        minute=rng.randint(0, 59),
        second=0,
        microsecond=0,
    )


def _delivery_zone(county: str, rng: random.Random) -> str:
    if county == "Nairobi":
        return rng.choice(["nairobi_doorstep", "nairobi_cbd_pickup", "free"])
    return rng.choice(["upcountry_courier", "free"])


def _make_order(user, products, rng, now) -> bool:
    lines = rng.sample(products, k=min(rng.randint(1, 4), len(products)))
    items = []
    subtotal = Decimal("0.00")
    for product in lines:
        quantity = rng.randint(1, 3)
        unit_price = product.current_price
        items.append((product, quantity, unit_price))
        subtotal += unit_price * quantity

    days_ago = rng.choices(
        [rng.randint(0, 6), rng.randint(7, 30), rng.randint(31, 90)],
        weights=[2, 3, 5],
    )[0]
    status = pick_status(days_ago, rng)
    method = rng.choice(["cod", "mpesa"])

    created_at = _timestamp(now, days_ago, rng)
    county, town = rng.choice(DESTINATIONS)
    guest_id = "" if user else f"{GUEST_PREFIX}{uuid.uuid4().hex[:12]}"

    discount = (
        (subtotal * Decimal("0.10")).quantize(Decimal("0.01"))
        if rng.random() < 0.2
        else Decimal("0.00")
    )

    order = Order.objects.create(
        user=user,
        guest_id=guest_id,
        email=(user.email if user else f"guest{rng.randint(1000, 9999)}@example.com"),
        phone_number=(user.phone_number if user and user.phone_number else _phone(rng)),
        shipping_name=user.display_name if user else "Guest Shopper",
        county=county,
        town=town,
        street_address=rng.choice(STREETS),
        delivery_method=_delivery_zone(county, rng),
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


def _make_cart(user, session_key, products, rng):
    cart = Cart.objects.create(user=user, session_key=session_key or None)
    for product in rng.sample(products, k=min(rng.randint(2, 4), len(products))):
        CartItem.objects.create(
            cart=cart,
            product=product,
            size=rng.choice(product.sizes) if product.sizes else "",
            quantity=rng.randint(1, 2),
        )
    return cart


def seed_shop(
    stdout,
    style,
    *,
    customers=20,
    max_orders=6,
    seed=42,
    password="wayaz1234",
    admin_password="admin1234",
    skip_admin=False,
):
    from django.core.management.base import CommandError

    if customers < 1 or customers > len(CUSTOMER_NAMES):
        raise CommandError(f"--customers must be between 1 and {len(CUSTOMER_NAMES)}.")

    products = list(Product.objects.prefetch_related("images"))
    if not products:
        raise CommandError("No products found. Run the catalog stage first.")

    rng = random.Random(seed)
    now = timezone.now()

    stdout.write("Wiping previously seeded shop data...")
    demo_users = User.objects.filter(email__endswith=DEMO_EMAIL_DOMAIN)
    Order.objects.filter(user__in=demo_users).delete()
    Order.objects.filter(guest_id__startswith=GUEST_PREFIX).delete()
    Cart.objects.filter(user__in=demo_users).delete()
    Cart.objects.filter(session_key__startswith=GUEST_PREFIX).delete()
    # Cascades addresses, wishlist items, and reviews along with them.
    deleted = demo_users.delete()[0]
    stdout.write(f"  Removed {deleted} rows (users + related shop data).")

    if not skip_admin and not User.objects.filter(is_superuser=True).exists():
        User.objects.create_superuser(
            username="admin",
            email=f"admin{DEMO_EMAIL_DOMAIN}",
            password=admin_password,
            first_name="Wayaz",
            last_name="Admin",
            role="admin",
        )
        stdout.write(f"  Created demo admin: admin / {admin_password}")

    customers_list = []
    for first, last in CUSTOMER_NAMES[:customers]:
        username = f"{first.lower()}.{last.lower()}"
        user = User.objects.create_user(
            username=username,
            email=f"{username}{DEMO_EMAIL_DOMAIN}",
            password=password,
            first_name=first,
            last_name=last,
            phone_number=_phone(rng),
            role="customer",
        )
        customers_list.append(user)

    stdout.write(f"  Created {len(customers_list)} demo customers.")

    for user in customers_list:
        # 1-3 addresses; the first is the default checkout destination.
        for idx in range(rng.randint(1, 3)):
            county, town = rng.choice(DESTINATIONS)
            Address.objects.create(
                user=user,
                full_name=user.display_name,
                phone_number=user.phone_number or _phone(rng),
                county=county,
                town=town,
                street_address=rng.choice(STREETS),
                is_default=idx == 0,
            )

    order_total = 0
    for user in customers_list:
        count = rng.choices(
            range(1, max_orders + 1),
            weights=[6, 5, 4, 3, 2, 1][:max_orders],
        )[0]
        for _ in range(count):
            if _make_order(user, products, rng, now):
                order_total += 1

    for _ in range(rng.randint(3, 6)):
        if _make_order(None, products, rng, now):
            order_total += 1

    stdout.write(f"  Created {order_total} orders (backdated ~90 days).")

    for user in rng.sample(customers_list, k=min(4, len(customers_list))):
        _make_cart(user=user, session_key="", products=products, rng=rng)
    _make_cart(
        user=None,
        session_key=f"{GUEST_PREFIX}{uuid.uuid4().hex[:12]}",
        products=products,
        rng=rng,
    )
    stdout.write("  Created 5 active carts (4 account, 1 guest).")

    wishlist_rows = review_rows = 0
    for user in customers_list:
        wish_count = min(rng.randint(2, 8), len(products))
        for product in rng.sample(products, k=wish_count):
            _, created = WishlistItem.objects.get_or_create(user=user, product=product)
            wishlist_rows += int(created)

        review_count = min(rng.randint(3, 9), len(products))
        for product in rng.sample(products, k=review_count):
            rating = rng.choices(range(1, 6), weights=RATING_WEIGHTS)[0]
            _, created = ProductReview.objects.get_or_create(
                user=user,
                product=product,
                defaults={
                    "rating": rating,
                    "comment": rng.choice(REVIEW_COMMENTS[rating]),
                },
            )
            review_rows += int(created)

    stdout.write(f"  Created {wishlist_rows} wishlist saves and {review_rows} reviews.")

    coupon_rows = 0
    for code, discount_type, value, active, audience, auto_apply in DEMO_COUPONS:
        _, created = Coupon.objects.get_or_create(
            code=code,
            defaults={
                "discount_type": discount_type,
                "discount_value": Decimal(value),
                "is_active": active,
                "audience": audience,
                "auto_apply": auto_apply,
            },
        )
        coupon_rows += int(created)
    stdout.write(f"  Created {coupon_rows} demo coupon codes.")

    stdout.write(
        style.SUCCESS(
            "\nShop seeded. Demo customer login: "
            f"{customers_list[0].username} / {password}"
        )
    )
