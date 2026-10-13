"""Signed capability tokens proving the holder placed an order.

Issued in the checkout response (`payment_token`) and required by the
M-Pesa STK push / payment-status endpoints, which are otherwise public.
This closes the hole where anyone who knew (or guessed) an order number
could fire an STK push at that order's phone number, or poll its payment
state. Signed with Django's built-in signing (HMAC + timestamp) - no extra
dependencies, and the payload carries no PII.
"""

from django.core import signing

TOKEN_SALT = "orders.payment-token"

# Long enough to retry a payment prompt straight after checkout, short
# enough that a leaked token expires quickly. Logged-in owners don't need
# the token at all - they authenticate instead.
TOKEN_MAX_AGE_SECONDS = 60 * 60


def make_payment_token(order) -> str:
    return signing.dumps(
        {"order": order.id, "number": order.order_number}, salt=TOKEN_SALT
    )


def verify_payment_token(token, order) -> bool:
    try:
        data = signing.loads(token or "", salt=TOKEN_SALT, max_age=TOKEN_MAX_AGE_SECONDS)
    except signing.BadSignature:
        return False
    return data.get("order") == order.id and data.get("number") == order.order_number


def request_owns_order(request, order) -> bool:
    """True when the caller may act on the order's payment flow: either the
    authenticated shopper who placed it, or a holder of the signed payment
    token from the checkout response (guest checkout included)."""
    user = getattr(request, "user", None)
    if user is not None and user.is_authenticated and order.user_id == user.id:
        return True
    token = (
        request.data.get("payment_token")
        or request.query_params.get("payment_token")
        or request.headers.get("X-Payment-Token")
    )
    return verify_payment_token(token, order)
