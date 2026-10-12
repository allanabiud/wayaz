"""Order lifecycle emails; all fire-and-forget (never raise) - the
WhatsApp link is the primary confirmation channel.

Flow: checkout -> "order received" email; successful M-Pesa payment ->
"payment received" email; admin confirms the order -> "order confirmed"
email."""
from django.conf import settings
from django.core.mail import send_mail


def send_order_confirmation_email(order):
    subject = f"Wayaz order {order.order_number} received"
    body = (
        f"Hi {order.shipping_name},\n\n"
        f"Thanks for shopping with Wayaz Collection!\n\n"
        f"Order number: {order.order_number}\n"
        f"Status: {order.get_status_display()}\n"
        f"Items: {order.item_count}\n"
        f"Delivery: {order.get_delivery_method_display()} to "
        f"{order.town}, {order.county}\n"
        f"Total: Ksh {order.total_amount}\n\n"
        f"Reply to this email or message us on WhatsApp for help:\n"
        f"{order.whatsapp_link}\n\n"
        f"- Wayaz Collection"
    )
    try:
        send_mail(
            subject,
            body,
            settings.DEFAULT_FROM_EMAIL,
            [order.email],
            fail_silently=True,
        )
    except Exception:  # noqa: BLE001 - notification hooks must not block orders
        pass


def send_payment_received_email(order):
    """M-Pesa payment landed; the order itself is still awaiting admin confirmation."""
    subject = f"Payment received for Wayaz order {order.order_number}"
    body = (
        f"Hi {order.shipping_name},\n\n"
        f"We've received your M-Pesa payment for order {order.order_number}.\n\n"
        f"Total paid: Ksh {order.total_amount}\n"
        f"Order status: {order.get_status_display()}\n\n"
        f"Our team will review and confirm your order shortly. "
        f"You'll get another email once it's confirmed.\n\n"
        f"Reply to this email or message us on WhatsApp for help:\n"
        f"{order.whatsapp_link}\n\n"
        f"- Wayaz Collection"
    )
    try:
        send_mail(
            subject,
            body,
            settings.DEFAULT_FROM_EMAIL,
            [order.email],
            fail_silently=True,
        )
    except Exception:  # noqa: BLE001 - notification hooks must not block orders
        pass


def send_order_confirmed_email(order):
    """Admin/staff confirmed the order from the dashboard."""
    subject = f"Wayaz order {order.order_number} confirmed"
    body = (
        f"Hi {order.shipping_name},\n\n"
        f"Great news - your order {order.order_number} has been confirmed "
        f"and is being prepared for delivery.\n\n"
        f"Items: {order.item_count}\n"
        f"Delivery: {order.get_delivery_method_display()} to "
        f"{order.town}, {order.county}\n"
        f"Total: Ksh {order.total_amount}\n"
        f"Payment: {order.get_payment_status_display()}\n\n"
        f"Reply to this email or message us on WhatsApp for help:\n"
        f"{order.whatsapp_link}\n\n"
        f"- Wayaz Collection"
    )
    try:
        send_mail(
            subject,
            body,
            settings.DEFAULT_FROM_EMAIL,
            [order.email],
            fail_silently=True,
        )
    except Exception:  # noqa: BLE001 - notification hooks must not block orders
        pass
