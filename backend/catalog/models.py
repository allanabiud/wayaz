from django.conf import settings
from django.core.signals import request_finished, request_started
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models.functions import Coalesce
from django.utils.text import slugify

# StoreSettings is a singleton (pk forced to 1); memoize per request so
# serializing order rows doesn't re-SELECT this table once per order.
_REQUEST_CACHE_ATTR = "_wayaz_store_settings"


class Category(models.Model):
    # Lucide icon keys the admin can pick; blank or unknown values render a tag.
    ICON_CHOICES = [
        ("tag", "Tag (default)"),
        ("shirt", "Shirt / tops"),
        ("jeans", "Jeans"),
        ("sneakers", "Shoes"),
        ("watch", "Watches"),
        ("gem", "Jewellery"),
        ("glasses", "Eyewear"),
        ("backpack", "Backpacks"),
        ("shopping-bag", "Bags"),
        ("package", "Parcels"),
        ("scissors", "Scissors"),
        ("footprints", "Footprints"),
        ("sparkles", "New arrivals"),
        ("crown", "Premium"),
        ("flame", "Hot"),
        ("star", "Featured"),
        ("heart", "Loved"),
        ("gift", "Gifts"),
        ("sun", "Summer"),
        ("moon", "Night"),
        ("zap", "Trending"),
        ("award", "Awards"),
        ("ruler", "Measurements"),
    ]

    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True, blank=True)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to="categories/", blank=True, null=True)
    icon = models.CharField(max_length=32, choices=ICON_CHOICES, blank=True)
    display_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "Categories"
        ordering = ["display_order", "name"]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class ProductQuerySet(models.QuerySet):
    def with_stock(self):
        """Annotates `_stock` with total units across size rows."""
        return self.annotate(
            _stock=Coalesce(models.Sum("size_stock__quantity"), models.Value(0))
        )


class Product(models.Model):
    objects = ProductQuerySet.as_manager()

    title = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True, blank=True)
    category = models.ForeignKey(
        Category, on_delete=models.CASCADE, related_name="products"
    )
    description = models.TextField(blank=True)
    base_price = models.DecimalField(max_digits=10, decimal_places=2, db_index=True)
    sale_price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    # Merchandising flag - surfaced in the storefront's Featured shelf.
    is_featured = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["category", "-created_at"], name="cat_prod_cat_created_idx"
            ),
            models.Index(
                fields=["is_featured", "-created_at"], name="cat_prod_feat_created_idx"
            ),
        ]

    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.title)
            slug = base_slug
            counter = 1
            while Product.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f"{base_slug}-{counter}"
                counter += 1
            self.slug = slug
        super().save(*args, **kwargs)

    @property
    def is_on_sale(self):
        return self.sale_price is not None and self.sale_price < self.base_price

    @property
    def current_price(self):
        return self.sale_price if self.is_on_sale else self.base_price

    @property
    def primary_image(self):
        # Display order wins, then is_primary, then id. Reads come from
        # select_related("images"), so reuse the cached queryset.
        images = list(self.images.all())
        if not images:
            return None
        ordered = sorted(
            images,
            key=lambda i: (i.display_order, 0 if i.is_primary else 1, i.id),
        )
        return ordered[0]

    @property
    def total_stock(self):
        return sum(row.quantity for row in self.size_stock.all())

    @property
    def is_in_stock(self):
        return self.total_stock > 0

    @property
    def sizes(self):
        """Size labels this product offers (one-size products: [])."""
        return [row.size for row in self.size_stock.all() if row.size]

    @property
    def available_sizes(self):
        """Size labels with stock left - all the storefront offers."""
        return [
            row.size for row in self.size_stock.all() if row.size and row.quantity > 0
        ]

    def size_quantity(self, size):
        for row in self.size_stock.all():
            if row.size == size:
                return row.quantity
        return 0

    def __str__(self):
        return self.title


class ProductSize(models.Model):
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="size_stock"
    )
    # "" = one-size product; a single row keeps stock handling uniform.
    size = models.CharField(max_length=50, blank=True, default="")
    quantity = models.PositiveIntegerField(default=0)
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ("product", "size")
        ordering = ["display_order", "id"]

    def __str__(self):
        return f"{self.product.title} [{self.size or 'One size'}] x{self.quantity}"


class ProductImage(models.Model):
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="images"
    )
    image = models.ImageField(upload_to="products/")
    alt_text = models.CharField(max_length=200, blank=True)
    is_primary = models.BooleanField(default=False)
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["display_order", "id"]

    def save(self, *args, **kwargs):
        if self.is_primary:
            # Clear primary flag from other images for this product
            ProductImage.objects.filter(product=self.product).exclude(
                pk=self.pk
            ).update(is_primary=False)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Image for {self.product.title}"


class ProductReview(models.Model):
    """A 1-5 star rating, optionally with written feedback, one per product
    per user. Publishes immediately; a staff-hidden review drops from the
    public list and the rating average."""

    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="reviews"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="product_reviews",
    )
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    comment = models.TextField(blank=True)
    is_approved = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["product", "user"],
                name="unique_product_review_per_user",
            )
        ]

    def __str__(self):
        return f"{self.rating}/5 - {self.product.title} ({self.user})"


class StoreSettings(models.Model):
    """Business and storefront configuration managed from the admin dashboard."""

    store_name = models.CharField(max_length=120, default="Wayaz Collection")
    tagline = models.CharField(
        max_length=255,
        blank=True,
        default="Fresh pieces delivered across Kenya - order on WhatsApp or add them to your cart.",
    )
    logo = models.ImageField(upload_to="branding/", blank=True, null=True)
    favicon = models.ImageField(upload_to="branding/", blank=True, null=True)
    whatsapp_number = models.CharField(
        max_length=30,
        default="254700000000",
        help_text="Primary WhatsApp number for store orders and support, in international format without plus (e.g. 254700000000).",
    )
    whatsapp_message = models.CharField(
        max_length=255,
        blank=True,
        default="Hi Wayaz, I'd like to make an inquiry.",
    )
    contact_phone = models.CharField(
        max_length=30, blank=True, default="+254 700 000 000"
    )
    support_phones = models.JSONField(
        default=list,
        blank=True,
        help_text='List of {"label": "Sales", "number": "2547..."} objects.',
    )
    contact_email = models.EmailField(blank=True, default="orders@wayaz.co.ke")
    address = models.CharField(max_length=255, blank=True, default="Nairobi, Kenya")
    instagram_url = models.URLField(
        max_length=255, blank=True, default="https://www.instagram.com/wayaz"
    )
    facebook_url = models.URLField(
        max_length=255, blank=True, default="https://www.facebook.com/wayaz"
    )
    tiktok_url = models.URLField(max_length=255, blank=True, default="")
    twitter_url = models.URLField(max_length=255, blank=True, default="")
    youtube_url = models.URLField(max_length=255, blank=True, default="")
    announcement_text = models.CharField(max_length=255, blank=True, default="")
    is_announcement_active = models.BooleanField(default=False)
    mpesa_shortcode = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="M-Pesa Till number or Paybill shortcode. Overrides MPESA_SHORTCODE env var when set.",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Store Settings"
        verbose_name_plural = "Store Settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)
        _clear_request_cache()

    @classmethod
    def load(cls):
        # Memoize per request, not across requests: one SELECT serves every
        # row, and the value dies with the request so later writes are safe.
        holder = getattr(settings, _REQUEST_CACHE_ATTR, None)
        if holder is not None and "store_settings" in holder:
            return holder["store_settings"]
        obj, _ = cls.objects.get_or_create(pk=1)
        if holder is not None:
            holder["store_settings"] = obj
        return obj

    def __str__(self):
        return f"{self.store_name} Settings"


def _clear_request_cache():
    holder = getattr(settings, _REQUEST_CACHE_ATTR, None)
    if holder is not None:
        holder.pop("store_settings", None)


def _activate_request_cache(sender, **kwargs):
    # One dict per request. settings is a process-wide singleton, so this is
    # safe: the dict lives exactly as long as the request that created it.
    if not hasattr(settings, _REQUEST_CACHE_ATTR):
        setattr(settings, _REQUEST_CACHE_ATTR, {})


def _teardown_request_cache(sender, **kwargs):
    if hasattr(settings, _REQUEST_CACHE_ATTR):
        delattr(settings, _REQUEST_CACHE_ATTR)


request_started.connect(_activate_request_cache)
request_finished.connect(_teardown_request_cache)


class RestockNotification(models.Model):
    """Shopper opt-in for an out-of-stock piece. One row per product + email;
    resubscribing is idempotent, not a 400."""

    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="restock_notifications"
    )
    email = models.EmailField()
    # Optional phone: some shoppers prefer the WhatsApp ping the store
    # already sends from.
    phone = models.CharField(max_length=30, blank=True, default="")
    is_notified = models.BooleanField(
        default=False,
        help_text="Set once the restock alert has gone out, so a product that "
        "sells out again doesn't re-ping the same person.",
    )
    notified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        # The idempotency key: the same shopper can only sit on the list once.
        constraints = [
            models.UniqueConstraint(
                fields=["product", "email"], name="unique_restock_per_email"
            )
        ]
        verbose_name = "Restock Notification"
        verbose_name_plural = "Restock Notifications"

    def __str__(self):
        return f"{self.email} <- {self.product.title}"


class ContactMessage(models.Model):
    name = models.CharField(max_length=120)
    email = models.EmailField()
    phone = models.CharField(max_length=30, blank=True, default="")
    subject = models.CharField(max_length=200)
    message = models.TextField()
    is_read = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Contact Message"
        verbose_name_plural = "Contact Messages"

    def __str__(self):
        return f"{self.name} - {self.subject} ({self.created_at.strftime('%Y-%m-%d')})"
