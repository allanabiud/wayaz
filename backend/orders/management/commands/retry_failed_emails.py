"""Cron or manual command to retry failed emails recorded in the EmailLog table."""

import logging

from django.core.management.base import BaseCommand
from django.utils import timezone

from orders.emails import (
    send_new_order_email_merchant,
    send_order_confirmation_email,
    send_order_confirmed_email,
    send_payment_received_email,
)
from orders.models import EmailLog

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Retry transiently failed transactional emails recorded in EmailLog (up to 3 attempts)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--max-attempts",
            type=int,
            default=3,
            help="Maximum failure count before giving up on an email (default: 3).",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=50,
            help="Maximum number of failed emails to retry in one run (default: 50).",
        )

    def handle(self, *args, **options):
        max_attempts = options["max_attempts"]
        limit = options["limit"]

        failed_logs = EmailLog.objects.filter(
            status=EmailLog.Status.FAILED,
            retry_count__lt=max_attempts,
        ).select_related("order")[:limit]

        count = len(failed_logs)
        if count == 0:
            self.stdout.write(self.style.SUCCESS("No failed emails to retry."))
            return

        self.stdout.write(f"Retrying {count} failed email(s)...")

        succeeded = 0
        abandoned = 0

        for log in failed_logs:
            log.retry_count += 1
            order = log.order

            if not order:
                self.stdout.write(
                    self.style.WARNING(
                        f"Skipping log {log.id} ({log.email_type}): associated order was deleted."
                    )
                )
                log.save(update_fields=["retry_count"])
                abandoned += 1
                continue

            try:
                if log.email_type == "order_confirmation":
                    send_order_confirmation_email(order)
                elif log.email_type == "payment_received":
                    send_payment_received_email(order)
                elif log.email_type == "order_confirmed":
                    send_order_confirmed_email(order)
                elif log.email_type == "merchant_order_alert":
                    send_new_order_email_merchant(order)
                else:
                    self.stdout.write(
                        f"Unknown email_type {log.email_type} for log {log.id}"
                    )
                    continue

                log.status = EmailLog.Status.SENT
                log.sent_at = timezone.now()
                log.error_message = ""
                log.save(
                    update_fields=["status", "sent_at", "error_message", "retry_count"]
                )
                succeeded += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Successfully retried {log.email_type} to {log.recipient} for {order.order_number}"
                    )
                )
            except Exception as exc:  # noqa: BLE001
                log.error_message = f"Retry {log.retry_count} failed: {exc}"
                log.save(update_fields=["error_message", "retry_count"])
                self.stdout.write(
                    self.style.ERROR(
                        f"Retry failed for {log.email_type} to {log.recipient}: {exc}"
                    )
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"Done: {succeeded} retried successfully, {abandoned} abandoned, {count - succeeded - abandoned} remaining."
            )
        )
