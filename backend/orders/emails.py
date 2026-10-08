"""Order confirmation email hook (Phase 6, Step 6.5).

Fires after a checkout commits; must never break order placement, so all
failures are swallowed (the WhatsApp link is the primary confirmation channel).
"""
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
