"""Kenyan delivery zones and fees.

Nairobi doorstep / CBD pickup / upcountry courier; orders at or above
FREE_DELIVERY_THRESHOLD ship free.
"""
from decimal import Decimal

FREE_DELIVERY_THRESHOLD = Decimal("5000.00")

DELIVERY_ZONES = {
    "nairobi_doorstep": {
        "label": "Nairobi Doorstep",
        "fee": Decimal("300.00"),
    },
    "nairobi_cbd_pickup": {
        "label": "Nairobi CBD Pickup",
        "fee": Decimal("150.00"),
    },
    "upcountry_courier": {
        "label": "Upcountry Standard Courier",
        "fee": Decimal("600.00"),
    },
}

DELIVERY_ZONE_CHOICES = [(key, zone["label"]) for key, zone in DELIVERY_ZONES.items()]


def delivery_fee(zone_key, subtotal):
    """Return the delivery fee for a zone, waived above the free threshold."""
    zone = DELIVERY_ZONES.get(zone_key)
    if zone is None:
        raise ValueError(f"Unknown delivery zone: {zone_key}")
    if subtotal >= FREE_DELIVERY_THRESHOLD:
        return Decimal("0.00")
    return zone["fee"]
