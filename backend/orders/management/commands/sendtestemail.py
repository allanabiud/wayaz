"""Send one real SMTP test message so delivery can be verified from the
panel (docs/deployment-guide.md). Exits non-zero on failure so it doubles
as a cron/monitoring probe."""

from django.conf import settings
from django.core.mail import send_mail
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Send a test email through the configured SMTP backend."

    def add_arguments(self, parser):
        parser.add_argument(
            "to",
            nargs="?",
            default=None,
            help="Recipient address (default: MANAGER_EMAIL).",
        )

    def handle(self, *args, **options):
        recipient = options["to"] or getattr(settings, "MANAGER_EMAIL", "")
        if not recipient:
            raise CommandError(
                "No recipient: pass --to or set MANAGER_EMAIL in the environment."
            )

        host = settings.EMAIL_HOST
        port = settings.EMAIL_PORT
        self.stdout.write(
            f"Sending via {host}:{port} as {settings.EMAIL_HOST_USER} "
            f"(from {settings.DEFAULT_FROM_EMAIL}) -> {recipient}"
        )
        try:
            send_mail(
                "Wayaz SMTP test",
                "SMTP is working. This is a test message from the Wayaz backend.",
                settings.DEFAULT_FROM_EMAIL,
                [recipient],
                fail_silently=False,
            )
        except Exception as exc:  # noqa: BLE001 - report any backend failure
            raise CommandError(f"Email failed: {type(exc).__name__}: {exc}") from exc

        self.stdout.write(self.style.SUCCESS(f"Email sent to {recipient}"))
