"""Sweep unpaid orders: restore their stock and drop stale M-Pesa payment
holds outright. COD is excluded unless --include-cod; a PENDING payment in
the last hour is skipped as in-flight. Runs from cron
(docs/deployment-guide.md)."""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from orders.models import Order
from payments.models import PaymentTransaction
from payments.views import reconcile_transaction

# Recent PENDING transaction means the shopper may still be at the PIN prompt.
IN_FLIGHT_GRACE = timedelta(hours=1)


class Command(BaseCommand):
    help = "Sweep stale unpaid M-Pesa holds and cancel stale COD orders."

    def add_arguments(self, parser):
        parser.add_argument(
            "--minutes",
            type=int,
            default=5,
            help="Age in minutes before an unpaid M-Pesa order is swept (default: 5).",
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
            help="Report what would be swept or cancelled without changing anything.",
        )

    def _stale(self, method, statuses, cutoff, recover=False):
        base = Order.objects.filter(
            status__in=statuses,
            payment_status=Order.PaymentStatus.PENDING,
            payment_method=method,
            created_at__lt=cutoff,
        )
        if recover:
            # Zombie holds: the STK attempt sits PENDING forever when the
            # callback never arrives, and the in-flight grace below would
            # shield the hold for a whole hour - blocking checkout retries
            # with it. Ask Safaricom directly first: a paid attempt becomes
            # a real order and leaves this set; a failed one releases its
            # hold right here. Only a genuinely open attempt keeps the grace
            # (this also never sweeps an order Safaricom says was paid).
            for payment in PaymentTransaction.objects.filter(
                status=PaymentTransaction.Status.PENDING, order__in=base
            ):
                reconcile_transaction(payment, force=True)
        in_flight = PaymentTransaction.objects.filter(
            status=PaymentTransaction.Status.PENDING,
            created_at__gte=timezone.now() - IN_FLIGHT_GRACE,
        ).values_list("order_id", flat=True)
        return base.exclude(id__in=list(in_flight)).order_by("created_at")

    def handle(self, *args, **options):
        now = timezone.now()
        dry = options["dry_run"]
        cancelled = []

        targets = list(
            self._stale(
                Order.PaymentMethod.M_PESA,
                # AWAITING_PAYMENT is the hold itself; PROCESSING catches
                # pre-hold M-Pesa orders that never got verified.
                [Order.Status.AWAITING_PAYMENT, Order.Status.PROCESSING],
                now - timedelta(minutes=options["minutes"]),
                # Recovering resolves real payments: never under --dry-run.
                recover=not dry,
            )
        )
        if options["include_cod"]:
            targets.extend(
                self._stale(
                    Order.PaymentMethod.COD,
                    [Order.Status.PROCESSING],
                    now - timedelta(minutes=options["cod_minutes"]),
                )
            )

        for order in targets:
            hold = order.status == Order.Status.AWAITING_PAYMENT
            if dry:
                verb = "sweep" if hold else "cancel"
                self.stdout.write(f"  [dry-run] would {verb} {order.order_number}")
                continue
            order.cancel()  # atomic: status flip + stock restoration
            if hold:
                # A hold was never a real order: drop it outright, failing
                # payment attempts and all.
                order.delete()
            cancelled.append(order.order_number)
            self.stdout.write(
                f"  {'swept' if hold else 'cancelled'} {order.order_number} "
                f"({order.payment_method}, restocked)"
            )

        verb = "would clear" if dry else "cleared"
        self.stdout.write(
            self.style.SUCCESS(
                f"Stale-order sweep: {verb} {len(targets)} order(s)"
                f"{'' if dry else f': {", ".join(cancelled) if cancelled else "-"}'}"
            )
        )
