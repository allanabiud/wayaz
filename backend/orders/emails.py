import logging
from concurrent.futures import ThreadPoolExecutor

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone

logger = logging.getLogger(__name__)

_email_executor = ThreadPoolExecutor(
    max_workers=2, thread_name_prefix="wayaz-email-worker"
)


def _format_currency(value):
    """Format decimal/float with commas for clean Kenyan shilling display."""
    try:
        val = float(value)
        if val.is_integer():
            return f"{int(val):,}"
        return f"{val:,.2f}"
    except (ValueError, TypeError):
        return str(value)


def _format_date(dt):
    if not dt:
        return ""
    return dt.strftime("%b %d, %Y at %I:%M %p")


def _get_absolute_url(path):
    if not path:
        return ""
    if (
        path.startswith("http://")
        or path.startswith("https://")
        or path.startswith("//")
    ):
        return path
    base = settings.FRONTEND_URL.rstrip("/")
    return f"{base}/{path.lstrip('/')}"


def _build_order_context(order):
    """Assemble rich template context with resolved images, branding, and formatted figures."""
    from catalog.models import StoreSettings

    try:
        store = StoreSettings.load()
    except Exception:  # noqa: BLE001
        store = None

    frontend_url = settings.FRONTEND_URL.rstrip("/")

    # Resolve logo URL (admin-uploaded or public fallback)
    logo_url = None
    if store and store.logo:
        try:
            logo_url = _get_absolute_url(store.logo.url)
        except Exception:  # noqa: BLE001
            logo_url = None
    if not logo_url:
        logo_url = f"{frontend_url}/wayaz_logo.jpeg"

    # Enriched items with product image thumbnails and links
    items_data = []
    for item in order.items.select_related("product").all():
        image_url = None
        product_url = None
        if item.product:
            product_url = f"{frontend_url}/products/{item.product.slug}"
            try:
                primary = item.product.primary_image
                if primary and primary.image:
                    image_url = _get_absolute_url(primary.image.url)
            except Exception:  # noqa: BLE001
                image_url = None

        items_data.append(
            {
                "title": item.product_title,
                "size": item.size,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "unit_price_formatted": _format_currency(item.unit_price),
                "line_total": item.line_total,
                "line_total_formatted": _format_currency(item.line_total),
                "image_url": image_url,
                "product_url": product_url,
            }
        )

    tx = (
        order.payment_transactions.filter(status="COMPLETED")
        .order_by("-updated_at")
        .first()
    )
    mpesa_receipt = tx.mpesa_receipt_number if tx and tx.mpesa_receipt_number else ""

    return {
        "order": order,
        "items": items_data,
        "store": store,
        "logo_url": logo_url,
        "frontend_url": frontend_url,
        "whatsapp_link": order.whatsapp_link,
        "order_date": _format_date(order.created_at),
        "subtotal_formatted": _format_currency(order.subtotal),
        "discount_formatted": _format_currency(order.discount_amount),
        "shipping_formatted": _format_currency(order.shipping_fee),
        "total_formatted": _format_currency(order.total_amount),
        "mpesa_receipt": mpesa_receipt,
    }


def _is_testing():
    """Detect if running inside unit tests where synchronous in-memory dispatch is expected."""
    backend = getattr(settings, "EMAIL_BACKEND", "")
    return backend.endswith("locmem.EmailBackend")


def _send_sync(
    subject, text_body, recipients, html_body=None, email_type="general", order=None
):
    """Synchronous sender: records delivery status to EmailLog table."""
    from orders.models import EmailLog

    for recipient in recipients:
        log_entry = None
        try:
            log_entry = EmailLog.objects.create(
                recipient=recipient,
                subject=subject,
                email_type=email_type,
                order=order,
                status=EmailLog.Status.PENDING,
            )
        except Exception:  # noqa: BLE001
            logger.exception("Failed to create EmailLog record for %s", recipient)

        try:
            msg = EmailMultiAlternatives(
                subject=subject,
                body=text_body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[recipient],
            )
            if html_body:
                msg.attach_alternative(html_body, "text/html")
            msg.send(fail_silently=False)

            if log_entry:
                log_entry.status = EmailLog.Status.SENT
                log_entry.sent_at = timezone.now()
                log_entry.save(update_fields=["status", "sent_at"])
            logger.info(
                "Email '%s' [%s] successfully sent to %s",
                subject,
                email_type,
                recipient,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "Failed to send email '%s' [%s] to %s: %s",
                subject,
                email_type,
                recipient,
                exc,
            )
            if log_entry:
                log_entry.status = EmailLog.Status.FAILED
                log_entry.error_message = str(exc)
                log_entry.save(update_fields=["status", "error_message"])


def _send(
    subject, text_body, recipients, html_body=None, email_type="general", order=None
):
    """Send multipart email reliably.

    1. Dispatches only after the active database transaction commits.
    2. Runs asynchronously in a background worker pool so SMTP latency never blocks HTTP checkout.
    3. Audits all sends and errors in the EmailLog database table.
    """
    if not recipients:
        return

    # In unit tests, run synchronously so assertions on mail.outbox succeed.
    use_async = not _is_testing()

    def dispatch():
        if use_async:
            _email_executor.submit(
                _send_sync, subject, text_body, recipients, html_body, email_type, order
            )
        else:
            _send_sync(subject, text_body, recipients, html_body, email_type, order)

    try:
        connection = transaction.get_connection()
        if connection.in_atomic_block and not _is_testing():
            transaction.on_commit(dispatch)
        else:
            dispatch()
    except Exception:  # noqa: BLE001
        dispatch()


def _summary_lines(order):
    """Receipt lines for plain text fallback."""
    lines = [f"Subtotal: Ksh {_format_currency(order.subtotal)}\n"]
    if order.discount_amount > 0:
        code = f" ({order.coupon.code})" if order.coupon else ""
        lines.append(f"Coupon{code}: -Ksh {_format_currency(order.discount_amount)}\n")
    if order.shipping_fee > 0:
        lines.append(f"Delivery: Ksh {_format_currency(order.shipping_fee)}\n")
    else:
        lines.append("Delivery: FREE\n")
    lines.append(f"Total: Ksh {_format_currency(order.total_amount)}\n")
    return "".join(lines)


def send_order_confirmation_email(order):
    """Send rich confirmation email to customer upon order placement."""
    subject = f"Wayaz order {order.order_number} received"
    text_body = (
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

    context = _build_order_context(order)
    context.update(
        {
            "headline": "Thanks for your order!",
            "subheadline": "We've received your order and are currently processing it.",
            "status_badge_text": order.get_status_display(),
            "status_badge_bg": "#fee2e2",
            "status_badge_color": "#e00613",
        }
    )

    try:
        html_body = render_to_string("emails/order_customer.html", context)
    except Exception:  # noqa: BLE001
        logger.exception(
            "Failed to render order confirmation HTML for %s", order.order_number
        )
        html_body = None

    _send(
        subject,
        text_body,
        [order.email],
        html_body=html_body,
        email_type="order_confirmation",
        order=order,
    )


def send_new_order_email_merchant(order):
    """Notify MANAGER_EMAIL of a new order with items and customer details."""
    recipient = getattr(settings, "MANAGER_EMAIL", "")
    if not recipient:
        logger.info(
            "MANAGER_EMAIL not configured; skipping merchant copy of %s",
            order.order_number,
        )
        return

    item_lines = "".join(
        f"  - {item.quantity}x {item.product_title} (Ksh {_format_currency(item.line_total)})\n"
        for item in order.items.all()
    )
    subject = f"New Wayaz order {order.order_number} (Ksh {_format_currency(order.total_amount)})"
    text_body = (
        f"New order placed on the storefront.\n\n"
        f"Order number: {order.order_number}\n"
        f"Payment: {order.get_payment_method_display()} "
        f"({order.get_payment_status_display()})\n"
        f"Customer: {order.shipping_name} | {order.phone_number} | {order.email}\n"
        f"Deliver to: {order.street_address}, {order.town}, {order.county}\n\n"
        f"Items:\n{item_lines}\n" + _summary_lines(order) + "\n"
        f"Follow up on WhatsApp:\n{order.whatsapp_link}\n"
    )

    context = _build_order_context(order)
    try:
        html_body = render_to_string("emails/order_merchant.html", context)
    except Exception:  # noqa: BLE001
        logger.exception(
            "Failed to render merchant order HTML for %s", order.order_number
        )
        html_body = None

    _send(
        subject,
        text_body,
        [recipient],
        html_body=html_body,
        email_type="merchant_order_alert",
        order=order,
    )


def send_payment_received_email(order):
    """M-Pesa payment landed; order still awaits admin confirmation."""
    subject = f"Payment received for Wayaz order {order.order_number}"
    text_body = (
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

    context = _build_order_context(order)
    context.update(
        {
            "headline": "Payment Received!",
            "subheadline": (
                f"We've verified your M-Pesa payment of Ksh {_format_currency(order.total_amount)}. "
                f"Our staff is preparing your items and will confirm your delivery shortly."
            ),
            "status_badge_text": "PAID · AWAITING CONFIRMATION",
            "status_badge_bg": "#dcfce7",
            "status_badge_color": "#15803d",
        }
    )

    try:
        html_body = render_to_string("emails/order_customer.html", context)
    except Exception:  # noqa: BLE001
        logger.exception(
            "Failed to render payment received HTML for %s", order.order_number
        )
        html_body = None

    _send(
        subject,
        text_body,
        [order.email],
        html_body=html_body,
        email_type="payment_received",
        order=order,
    )


def send_order_confirmed_email(order):
    """Staff confirmed the order; customer notified it is being packed/dispatched."""
    subject = f"Wayaz order {order.order_number} confirmed"
    text_body = (
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

    context = _build_order_context(order)
    context.update(
        {
            "headline": "Your order is confirmed!",
            "subheadline": (
                f"Great news! Your order has been approved and is being packed for delivery "
                f"to {order.town}, {order.county}."
            ),
            "status_badge_text": "CONFIRMED · PREPARING FOR DELIVERY",
            "status_badge_bg": "#dbeafe",
            "status_badge_color": "#1d4ed8",
        }
    )

    try:
        html_body = render_to_string("emails/order_customer.html", context)
    except Exception:  # noqa: BLE001
        logger.exception(
            "Failed to render order confirmed HTML for %s", order.order_number
        )
        html_body = None

    _send(
        subject,
        text_body,
        [order.email],
        html_body=html_body,
        email_type="order_confirmed",
        order=order,
    )
