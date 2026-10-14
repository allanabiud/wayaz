"""Cancel stale unpaid orders and give their stock back. COD is excluded
unless --include-cod; a PENDING payment in the last hour is skipped as
in-flight. Runs from cron (docs/deployment-guide.md)."""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from orders.models import Order
from payments.models import PaymentTransaction

# Recent PENDING transaction means the shopper may still be at the PIN prompt.
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
