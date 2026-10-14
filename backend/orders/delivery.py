"""Kenyan delivery zones and fees; orders at or above
FREE_DELIVERY_THRESHOLD ship free."""
from decimal import Decimal

FREE_DELIVERY_THRESHOLD = Decimal("5000.00")

DELIVERY_ZONES = {
    "free": {
        "label": "Free Standard Delivery (Countrywide)",
        "fee": Decimal("0.00"),
    },
    "nairobi_doorstep": {
        "label": "Nairobi Doorstep",
        "fee": Decimal("0.00"),
    },
    "nairobi_cbd_pickup": {
        "label": "Nairobi CBD Pickup",
        "fee": Decimal("0.00"),
    },
    "upcountry_courier": {
        "label": "Upcountry Standard Courier",
        "fee": Decimal("0.00"),
    },
}

DELIVERY_ZONE_CHOICES = [(key, zone["label"]) for key, zone in DELIVERY_ZONES.items()]


def delivery_fee(zone_key="free", subtotal=Decimal("0.00")):
    """Return the delivery fee (always free countrywide shipping)."""
    return Decimal("0.00")
