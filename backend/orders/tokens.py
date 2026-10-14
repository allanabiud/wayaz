"""Signed tokens proving the holder placed an order. Issued at checkout and
required by the otherwise-public M-Pesa endpoints, so nobody can fire an
STK push at an order they don't own."""

from django.core import signing

TOKEN_SALT = "orders.payment-token"

# Long enough to retry a payment prompt, short enough that a leaked token
# expires quickly.
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
    """True for the shopper who placed the order or a holder of its payment
    token (guest checkout included)."""
    user = getattr(request, "user", None)
    if user is not None and user.is_authenticated and order.user_id == user.id:
        return True
    token = (
        request.data.get("payment_token")
        or request.query_params.get("payment_token")
        or request.headers.get("X-Payment-Token")
    )
    return verify_payment_token(token, order)
