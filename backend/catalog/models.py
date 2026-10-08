from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.text import slugify


class Category(models.Model):
    JEANS = "jeans"
    SHOES = "shoes"
    SHIRTS = "shirts"
    BIKINIS = "bikinis"

    ALLOWED_CATEGORIES = [
        (JEANS, "Jeans"),
        (SHOES, "Shoes"),
        (SHIRTS, "Shirts"),
        (BIKINIS, "Bikinis"),
    ]

    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True, blank=True)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to="categories/", blank=True, null=True)
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


class Product(models.Model):
    title = models.CharField(max_length=255)
    slug = models.SlugField(max_length=280, unique=True, blank=True)
    category = models.ForeignKey(
        Category, on_delete=models.CASCADE, related_name="products"
    )
    description = models.TextField(blank=True)
    base_price = models.DecimalField(max_digits=10, decimal_places=2)
    sale_price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    stock_quantity = models.PositiveIntegerField(default=0)
    # Shopper-selectable sizes in display order, e.g. ["S", "M", "L"].
    # An empty list means a one-size product.
    sizes = models.JSONField(blank=True, default=list)
    # Merchandising flag - surfaced in the storefront's Featured shelf.
    is_featured = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

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
        primary = self.images.filter(is_primary=True).first()
        if not primary:
            primary = self.images.first()
        return primary

    @property
    def total_stock(self):
        return self.stock_quantity

    @property
    def is_in_stock(self):
        return self.stock_quantity > 0

    def __str__(self):
        return self.title


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
            ProductImage.objects.filter(product=self.product).exclude(pk=self.pk).update(
                is_primary=False
            )
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Image for {self.product.title}"


class ProductReview(models.Model):
    """A 1-5 star rating from a signed-in user. One per product per user."""

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
