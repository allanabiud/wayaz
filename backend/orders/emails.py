"""Order lifecycle emails; fire-and-forget (never raise), failures logged."""

import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def _send(subject, body, recipients):
    """Send without raising; log failures with context."""
    try:
        send_mail(
            subject,
            body,
            settings.DEFAULT_FROM_EMAIL,
            recipients,
            fail_silently=False,
        )
    except Exception:  # noqa: BLE001 - notification hooks must not block orders
        logger.exception("Failed to send email '%s' to %s", subject, recipients)


def _summary_lines(order):
    """Receipt lines; coupon row only when a discount was taken so the
    lines always add up to the total."""
    lines = [f"Subtotal: Ksh {order.subtotal}\n"]
    if order.discount_amount > 0:
        code = f" ({order.coupon.code})" if order.coupon else ""
        lines.append(f"Coupon{code}: -Ksh {order.discount_amount}\n")
    if order.shipping_fee > 0:
        lines.append(f"Delivery: Ksh {order.shipping_fee}\n")
    lines.append(f"Total: Ksh {order.total_amount}\n")
    return "".join(lines)


def send_order_confirmation_email(order):
    subject = f"Wayaz order {order.order_number} received"
    body = (
        f"Hi {order.shipping_name},\n\n"
        f"Thanks for shopping with Wayaz Collection!\n\n"
        f"Order number: {order.order_number}\n"
        f"Status: {order.get_status_display()}\n"
        f"Items: {order.item_count}\n"
        f"Delivery: {order.get_delivery_method_display()} to "
        f"{order.town}, {order.county}\n" + _summary_lines(order) + "\n"
        f"Reply to this email or message us on WhatsApp for help:\n"
        f"{order.whatsapp_link}\n\n"
        f"- Wayaz Collection"
    )
    _send(subject, body, [order.email])


def send_new_order_email_merchant(order):
    """Notify MANAGER_EMAIL of a new order; skipped when unset."""
    recipient = getattr(settings, "MANAGER_EMAIL", "")
    if not recipient:
        logger.info(
            "MANAGER_EMAIL not configured; skipping merchant copy of %s",
            order.order_number,
        )
        return

    item_lines = "".join(
        f"  - {item.quantity}x {item.product_title} (Ksh {item.line_total})\n"
        for item in order.items.all()
    )
    subject = f"New Wayaz order {order.order_number}"
    body = (
        f"New order placed on the storefront.\n\n"
        f"Order number: {order.order_number}\n"
        f"Payment: {order.get_payment_method_display()} "
        f"({order.get_payment_status_display()})\n"
        f"Customer: {order.shipping_name} | {order.phone_number} | {order.email}\n"
        f"Deliver to: {order.street_address}, {order.town}, {order.county}\n\n"
        f"Items:\n{item_lines}\n" + _summary_lines(order) + "\n"
        f"Follow up on WhatsApp:\n{order.whatsapp_link}\n"
    )
    _send(subject, body, [recipient])


def send_payment_received_email(order):
    """M-Pesa payment landed; order still awaits admin confirmation."""
    subject = f"Payment received for Wayaz order {order.order_number}"
    body = (
        f"Hi {order.shipping_name},\n\n"
        f"We've received your M-Pesa payment for order {order.order_number}.\n\n"
        + _summary_lines(order)
        + f"Order status: {order.get_status_display()}\n\n"
        f"Our team will review and confirm your order shortly. "
        f"You'll get another email once it's confirmed.\n\n"
        f"Reply to this email or message us on WhatsApp for help:\n"
        f"{order.whatsapp_link}\n\n"
        f"- Wayaz Collection"
    )
    _send(subject, body, [order.email])


def send_order_confirmed_email(order):
    subject = f"Wayaz order {order.order_number} confirmed"
    body = (
        f"Hi {order.shipping_name},\n\n"
        f"Great news - your order {order.order_number} has been confirmed "
        f"and is being prepared for delivery.\n\n"
        f"Items: {order.item_count}\n"
        f"Delivery: {order.get_delivery_method_display()} to "
        f"{order.town}, {order.county}\n"
        + _summary_lines(order)
        + f"Payment: {order.get_payment_status_display()}\n\n"
        f"Reply to this email or message us on WhatsApp for help:\n"
        f"{order.whatsapp_link}\n\n"
        f"- Wayaz Collection"
    )
    _send(subject, body, [order.email])
