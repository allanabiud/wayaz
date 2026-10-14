import re
import time

from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.test import TestCase
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APIClient

from catalog.models import Category, Product

User = get_user_model()


class AccountsAPITestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="shiquo_fan",
            email="shiquo@example.com",
            password="StrongPassword123!",
            first_name="Jane",
            last_name="Doe",
            phone_number="+254712345678",
        )

        self.category = Category.objects.create(name="Beauty", slug="beauty")
        self.product = Product.objects.create(
            title="Hydrating Glow Serum",
            slug="hydrating-glow-serum",
            category=self.category,
            base_price=3000.00,
        )

    def test_user_registration(self):
        payload = {
            "username": "new_customer",
            "email": "customer@example.com",
            "password": "CustomerPassword123!",
            "first_name": "Allan",
            "last_name": "Smith",
            "phone_number": "+254798765432",
        }
        response = self.client.post("/api/v1/auth/register/", payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(username="new_customer").exists())

    def test_jwt_token_obtain(self):
        payload = {
            "username": "shiquo_fan",
            "password": "StrongPassword123!",
        }
        response = self.client.post("/api/v1/auth/token/", payload)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertIn("user", response.data)
        self.assertEqual(response.data["user"]["email"], "shiquo@example.com")

    def test_jwt_token_obtain_via_email(self):
        payload = {
            "username": "SHIQUO@example.com",
            "password": "StrongPassword123!",
        }
        response = self.client.post("/api/v1/auth/token/", payload)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertEqual(response.data["user"]["username"], "shiquo_fan")
        self.assertEqual(response.data["user"]["email"], "shiquo@example.com")

    def test_user_profile_authenticated(self):
        token_res = self.client.post(
            "/api/v1/auth/token/",
            {"username": "shiquo_fan", "password": "StrongPassword123!"},
        )
        token = token_res.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        response = self.client.get("/api/v1/auth/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "shiquo_fan")
        self.assertEqual(response.data["phone_number"], "+254712345678")

    def test_address_crud(self):
        self.client.force_authenticate(user=self.user)
        payload = {
            "full_name": "Jane Doe",
            "phone_number": "+254712345678",
            "county": "Nairobi",
            "town": "Westlands",
            "street_address": "Parklands Rd, House 4B",
            "is_default": True,
        }
        response = self.client.post("/api/v1/auth/addresses/", payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["county"], "Nairobi")

    def test_wishlist_add_and_remove(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/v1/auth/wishlist/", {"product_id": self.product.id}
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        list_res = self.client.get("/api/v1/auth/wishlist/")
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_res.data.get("results", list_res.data)), 1)

        del_res = self.client.delete(
            f"/api/v1/auth/wishlist/remove-product/{self.product.id}/"
        )
        self.assertEqual(del_res.status_code, status.HTTP_204_NO_CONTENT)


class SuperuserRoleTestCase(TestCase):
    """`manage.py createsuperuser` runs through this manager; the account
    must come out an admin, not a customer."""

    def test_create_superuser_defaults_to_the_admin_role(self):
        admin = User.objects.create_superuser(
            "boss", "boss@example.com", "Password123!"
        )
        self.assertEqual(admin.role, User.Role.ADMIN)
        self.assertTrue(admin.is_superuser)
        self.assertTrue(admin.is_staff)

    def test_create_superuser_accepts_an_explicit_role(self):
        admin = User.objects.create_superuser(
            "boss", "boss@example.com", "Password123!", role=User.Role.STAFF
        )
        self.assertEqual(admin.role, User.Role.STAFF)


class AdminTeamAPITestCase(TestCase):
    """Team management: who can reach the dashboard, and how they are kept
    off it again."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="team_admin",
            email="team_admin@example.com",
            password="Password123!",
            role=User.Role.ADMIN,
        )
        self.staff = User.objects.create_user(
            username="team_staff",
            email="team_staff@example.com",
            password="Password123!",
            role=User.Role.STAFF,
        )
        self.customer = User.objects.create_user(
            username="team_buyer",
            email="team_buyer@example.com",
            password="Password123!",
            role=User.Role.CUSTOMER,
        )
        self.list_url = "/api/v1/admin/team/"

    def test_customers_cannot_see_the_team(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.get(self.list_url)
        self.assertIn(
            res.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_staff_can_list_but_not_change_the_team(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get("results", res.data)
        self.assertEqual(
            {row["username"] for row in results}, {"team_admin", "team_staff"}
        )

        res = self.client.post(
            self.list_url,
            {
                "username": "newbie",
                "email": "newbie@example.com",
                "password": "Password123!",
                "role": "staff",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_creates_a_teammate_with_a_usable_password(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            self.list_url,
            {
                "username": "newbie",
                "email": "newbie@example.com",
                "first_name": "New",
                "last_name": "Bee",
                "password": "Password123!",
                "role": User.Role.STAFF,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        newbie = User.objects.get(username="newbie")
        self.assertEqual(newbie.role, User.Role.STAFF)
        self.assertTrue(newbie.check_password("Password123!"))
        # The raw password never travels back out.
        self.assertNotIn("password", res.data)

    def test_cannot_create_a_customer_or_skip_the_password(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            self.list_url,
            {
                "username": "x",
                "email": "x@example.com",
                "password": "Password123!",
                "role": "customer",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        res = self.client.post(
            self.list_url,
            {"username": "x", "email": "x@example.com", "role": "staff"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(username="x").exists())

    def test_admin_changes_role_and_password(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch(
            f"{self.list_url}{self.staff.id}/",
            {"role": User.Role.ADMIN, "password": "NewPass123!"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.staff.refresh_from_db()
        self.assertEqual(self.staff.role, User.Role.ADMIN)
        self.assertTrue(self.staff.check_password("NewPass123!"))

    def test_nobody_deactivates_themselves(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch(
            f"{self.list_url}{self.admin.id}/", {"is_active": False}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)

    def test_the_last_admin_cannot_be_demoted_or_removed(self):
        self.client.force_authenticate(user=self.admin)

        res = self.client.patch(
            f"{self.list_url}{self.admin.id}/",
            {"role": User.Role.STAFF},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        res = self.client.delete(f"{self.list_url}{self.admin.id}/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(User.objects.filter(id=self.admin.id).exists())

    def test_last_admin_lock_lifts_once_another_admin_exists(self):
        User.objects.create_user(
            username="second_admin",
            email="second@example.com",
            password="Password123!",
            role=User.Role.ADMIN,
        )
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch(
            f"{self.list_url}{self.admin.id}/",
            {"role": User.Role.STAFF},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.role, User.Role.STAFF)

    def test_admin_removes_a_teammate(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.delete(f"{self.list_url}{self.staff.id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(id=self.staff.id).exists())


class PasswordResetAPITestCase(TestCase):
    """The forgot/reset pair: link in the mail, password on the way back."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="reset_me",
            email="RESET_ME@example.com",
            password="OldPassword123!",
        )
        self.forgot_url = "/api/v1/auth/forgot-password/"
        self.reset_url = "/api/v1/auth/reset-password/"

    def request_link(self, email):
        return self.client.post(self.forgot_url, {"email": email}, format="json")

    def mint_link(self):
        uidb64 = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)
        return uidb64, token

    def reset(self, uidb64, token, new_password="FreshPassword456!"):
        return self.client.post(
            self.reset_url,
            {"uidb64": uidb64, "token": token, "new_password": new_password},
            format="json",
        )

    def test_known_address_gets_a_working_link(self):
        res = self.request_link("reset_me@example.com")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)

        match = re.search(r"uidb64=([^&]+)&token=([^&\s]+)", mail.outbox[0].body)
        self.assertIsNotNone(match, mail.outbox[0].body)
        uidb64, token = match.groups()
        self.assertEqual(force_str(urlsafe_base64_decode(uidb64)), str(self.user.pk))
        self.assertTrue(default_token_generator.check_token(self.user, token))

    def test_unknown_and_known_addresses_answer_identically(self):
        known = self.request_link("reset_me@example.com")
        unknown = self.request_link("nobody@example.com")
        self.assertEqual(known.status_code, status.HTTP_200_OK)
        self.assertEqual(unknown.status_code, status.HTTP_200_OK)
        # Same body either way - no fishing for who has an account.
        self.assertEqual(known.json(), unknown.json())
        self.assertEqual(len(mail.outbox), 1)  # only the known one

    def test_reset_with_the_mailed_link(self):
        uidb64, token = self.mint_link()
        res = self.reset(uidb64, token)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("FreshPassword456!"))
        self.assertFalse(self.user.check_password("OldPassword123!"))
        self.assertIsNotNone(self.user.password_changed_at)

        # And the new password actually signs in.
        res = self.client.post(
            "/api/v1/auth/token/",
            {"username": "reset_me", "password": "FreshPassword456!"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_a_used_link_cannot_be_reused(self):
        uidb64, token = self.mint_link()
        self.assertEqual(self.reset(uidb64, token).status_code, status.HTTP_200_OK)
        # The token embeds the password hash, so the same link dies the
        # moment the password changes.
        res = self.reset(uidb64, token, new_password="AnotherOne789!")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("FreshPassword456!"))

    def test_tampered_or_unknown_links_are_refused(self):
        uidb64, token = self.mint_link()
        cases = (
            (uidb64, token + "x"),
            ("not-a-uid", token),
            (urlsafe_base64_encode(force_bytes(99999)), token),
        )
        for bad_uid, bad_token in cases:
            res = self.reset(bad_uid, bad_token)
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, res.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("OldPassword123!"))

    def test_weak_passwords_are_refused(self):
        uidb64, token = self.mint_link()
        res = self.reset(uidb64, token, new_password="123")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("OldPassword123!"))


class PasswordChangeInvalidationTestCase(TestCase):
    """Changing a password retires every token issued before it."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="session_holder",
            email="sessions@example.com",
            password="OldPassword123!",
            role=User.Role.STAFF,
        )
        res = self.client.post(
            "/api/v1/auth/token/",
            {"username": "session_holder", "password": "OldPassword123!"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.access = res.data["access"]
        self.refresh = res.data["refresh"]

        # JWT iat has whole-second precision; step past the current second so
        # the tokens above are definitively older than the change.
        time.sleep(1.1)

    def authed(self, token=None):
        return self.client.get(
            "/api/v1/auth/me/",
            HTTP_AUTHORIZATION=f"Bearer {token or self.access}",
        )

    def test_old_access_token_stops_authenticating_after_a_change(self):
        self.assertEqual(self.authed().status_code, status.HTTP_200_OK)

        self.user.change_password("NewPassword123!")

        res = self.authed()
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_old_refresh_token_cannot_be_traded_after_a_change(self):
        self.user.change_password("NewPassword123!")
        res = self.client.post(
            "/api/v1/auth/token/refresh/", {"refresh": self.refresh}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_new_tokens_work_normally(self):
        # No password change - the pair must keep trading.
        res = self.client.post(
            "/api/v1/auth/token/refresh/", {"refresh": self.refresh}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("access", res.data)

        # And after a change, signing in afresh issues usable tokens.
        self.user.change_password("NewPassword123!")
        res = self.client.post(
            "/api/v1/auth/token/",
            {"username": "session_holder", "password": "NewPassword123!"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.authed(res.data["access"]).status_code, status.HTTP_200_OK
        )
        res = self.client.post(
            "/api/v1/auth/token/refresh/",
            {"refresh": res.data["refresh"]},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_change_password_endpoint_stamps_the_timestamp(self):
        res = self.client.post(
            "/api/v1/auth/change-password/",
            {"old_password": "OldPassword123!", "new_password": "NewPassword123!"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {self.access}",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.password_changed_at)
        self.assertTrue(self.user.check_password("NewPassword123!"))

        # The password this request used no longer authenticates anywhere
        # else - that is the point of the timestamp.
        self.assertEqual(self.authed().status_code, status.HTTP_401_UNAUTHORIZED)

    def test_accounts_that_never_changed_are_unaffected(self):
        untouched = User.objects.create_user(
            username="never_changed",
            email="untouched@example.com",
            password="Password123!",
        )
        res = self.client.post(
            "/api/v1/auth/token/",
            {"username": "never_changed", "password": "Password123!"},
            format="json",
        )
        access = res.data["access"]
        res = self.client.get("/api/v1/auth/me/", HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["username"], untouched.username)
