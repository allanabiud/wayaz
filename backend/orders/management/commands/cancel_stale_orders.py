"""Cancel stale unpaid orders and give their stock back.

Checkout decrements stock immediately, but an M-Pesa order whose STK push
was abandoned (or failed before any callback) never becomes PAID - it
sits in PROCESSING forever with its stock reserved. This command cancels
those orders once they're older than --minutes and restores stock via the
atomic Order.cancel().

Cash-on-delivery orders are left alone by default: payment arrives on
delivery and staff confirmation legitimately takes longer than any
cancellation window. Opt them in with --include-cod (aged by
--cod-minutes, default 24h).

In-flight guard: an order with a PENDING payment transaction from the
last hour is skipped - the shopper may still be at the PIN prompt. If an
M-Pesa callback arrives after cancellation anyway, the order is marked
PAID while CANCELLED and staff refund manually (the money is real).

Intended to run from cron every 10 minutes (see docs/deployment-guide.md).
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from orders.models import Order
from payments.models import PaymentTransaction

# A PENDING transaction younger than this means someone may still be
# paying (STK prompts can be retried/redelivered by Safaricom).
IN_FLIGHT_GRACE = timedelta(hours=1)


class Command(BaseCommand):
    help = "Cancel stale unpaid orders and restock their products."

    def add_arguments(self, parser):
        parser.add_argument(
            "--minutes",
            type=int,
            default=30,
            help="Age in minutes before an unpaid M-Pesa order is cancelled (default: 30).",
        )
        parser.add_argument(
            "--include-cod",
            action="store_true",
            help="Also cancel cash-on-delivery orders still awaiting confirmation.",
        )
        parser.add_argument(
            "--cod-minutes",
            type=int,
            default=1440,
            help="Age in minutes for COD cancellations with --include-cod (default: 1440 = 24h).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be cancelled without changing anything.",
        )

    def _stale(self, method, cutoff):
        in_flight = PaymentTransaction.objects.filter(
            status=PaymentTransaction.Status.PENDING,
            created_at__gte=timezone.now() - IN_FLIGHT_GRACE,
        ).values_list("order_id", flat=True)
        return (
            Order.objects.filter(
                status=Order.Status.PROCESSING,
                payment_status=Order.PaymentStatus.PENDING,
                payment_method=method,
                created_at__lt=cutoff,
            )
            .exclude(id__in=list(in_flight))
            .order_by("created_at")
        )

    def handle(self, *args, **options):
        now = timezone.now()
        dry = options["dry_run"]
        cancelled = []

        targets = [
            *self._stale(
                Order.PaymentMethod.M_PESA, now - timedelta(minutes=options["minutes"])
            )
        ]
        if options["include_cod"]:
            targets.extend(
                self._stale(
                    Order.PaymentMethod.COD,
                    now - timedelta(minutes=options["cod_minutes"]),
                )
            )

        for order in targets:
            if dry:
                self.stdout.write(f"  [dry-run] would cancel {order.order_number}")
                continue
            order.cancel()  # atomic: status flip + stock restoration
            cancelled.append(order.order_number)
            self.stdout.write(
                f"  cancelled {order.order_number} ({order.payment_method}, restocked)"
            )

        verb = "would cancel" if dry else "cancelled"
        self.stdout.write(
            self.style.SUCCESS(
                f"Stale-order sweep: {verb} {len(targets)} order(s)"
                f"{'' if dry else f': {', '.join(cancelled) if cancelled else '-'}'}"
            )
        )
