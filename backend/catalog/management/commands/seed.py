"""Seed demo data: catalog, shop activity, or both."""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from catalog.management.seeders.catalog import seed_catalog
from catalog.management.seeders.shop import seed_shop


class Command(BaseCommand):
    help = (
        "Seed demo data. Stages: 'catalog' (categories, products, photos "
        "from examples/), 'shop' (demo customers, orders, carts, reviews), "
        "or 'all' (default)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "stage",
            nargs="?",
            choices=["catalog", "shop", "all"],
            default="all",
            help="What to seed (default: all).",
        )
        parser.add_argument(
            "--source",
            type=str,
            default=None,
            help="Folder containing category image subfolders (default: <repo root>/examples).",
        )
        parser.add_argument(
            "--wipe",
            action="store_true",
            help="Catalog stage: delete all products, categories, carts and orders first.",
        )
        parser.add_argument(
            "--customers",
            type=int,
            default=20,
            help="Shop stage: demo customers to create (default: 20, max: 24).",
        )
        parser.add_argument(
            "--max-orders",
            type=int,
            default=6,
            help="Shop stage: upper bound of orders per customer (default: 6).",
        )
        parser.add_argument(
            "--seed",
            type=int,
            default=42,
            help="Shop stage: random seed for reproducible data (default: 42).",
        )
        parser.add_argument(
            "--password",
            type=str,
            default="wayaz1234",
            help="Shop stage: password for every demo customer (default: wayaz1234).",
        )
        parser.add_argument(
            "--admin-password",
            type=str,
            default="admin1234",
            help="Shop stage: password for the demo admin if one is created.",
        )
        parser.add_argument(
            "--skip-admin",
            action="store_true",
            help="Shop stage: do not create a demo admin account.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Allow seeding when DEBUG is off (i.e. a real database).",
        )

    def handle(self, *args, **options):
        stage = options["stage"]
        destructive = stage in ("shop", "all") or (
            stage == "catalog" and options["wipe"]
        )
        if destructive and not settings.DEBUG and not options["force"]:
            raise CommandError(
                "Refusing to seed with DEBUG off - this looks like a real "
                "database. Re-run with --force if you really mean it."
            )

        if stage in ("catalog", "all"):
            seed_catalog(
                self.stdout,
                self.style,
                source=options["source"],
                wipe=options["wipe"],
            )

        if stage in ("shop", "all"):
            seed_shop(
                self.stdout,
                self.style,
                customers=options["customers"],
                max_orders=options["max_orders"],
                seed=options["seed"],
                password=options["password"],
                admin_password=options["admin_password"],
                skip_admin=options["skip_admin"],
            )
