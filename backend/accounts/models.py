from django.contrib.auth.models import AbstractUser
from django.contrib.auth.models import UserManager as DjangoUserManager
from django.db import models
from django.utils import timezone


class UserManager(DjangoUserManager):
    """`manage.py createsuperuser` must not leave the account a customer:
    Django's default manager lets `role` fall back to its model default.
    Superusers are admins unless told otherwise."""

    def create_superuser(self, username, email=None, password=None, **extra_fields):
        extra_fields.setdefault("role", self.model.Role.ADMIN)
        return super().create_superuser(username, email, password, **extra_fields)


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        STAFF = "staff", "Staff"
        CUSTOMER = "customer", "Customer"

    email = models.EmailField(unique=True)
    phone_number = models.CharField(max_length=25, blank=True, null=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CUSTOMER)
    # Tokens issued before this moment are refused (access on the next
    # request, refresh on the next trade). NULL = never changed here.
    password_changed_at = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    class Meta:
        db_table = "accounts_user"

    @property
    def display_name(self):
        full = self.get_full_name()
        return full if full else self.username

    def change_password(self, raw_password):
        """Set a new password and retire every token issued before now. The
        stamp is truncated to whole seconds to match JWT `iat`, so a
        sign-in in the same second cannot look older than the change."""
        self.set_password(raw_password)
        self.password_changed_at = timezone.now().replace(microsecond=0)
        self.save(update_fields=["password", "password_changed_at"])

    def __str__(self):
        return f"{self.display_name} ({self.get_role_display()})"


class Address(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="addresses")
    full_name = models.CharField(max_length=150)
    phone_number = models.CharField(max_length=25)
    county = models.CharField(max_length=100)
    town = models.CharField(max_length=100)
    street_address = models.CharField(max_length=255)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-is_default", "-created_at"]
        verbose_name_plural = "Addresses"

    def save(self, *args, **kwargs):
        if self.is_default:
            # Clear is_default from other addresses for this user
            Address.objects.filter(user=self.user).exclude(pk=self.pk).update(
                is_default=False
            )
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.full_name} - {self.town}, {self.county}"


class WishlistItem(models.Model):
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="wishlist_items"
    )
    product = models.ForeignKey(
        "catalog.Product", on_delete=models.CASCADE, related_name="wishlisted_by"
    )
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "product")
        ordering = ["-added_at"]

    def __str__(self):
        return f"{self.user.display_name} - {self.product.title}"
