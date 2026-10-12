from django.contrib.auth import get_user_model
from django.test import TestCase
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
        # Authenticate via credentials
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
        # Add to wishlist
        response = self.client.post(
            "/api/v1/auth/wishlist/", {"product_id": self.product.id}
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # List wishlist
        list_res = self.client.get("/api/v1/auth/wishlist/")
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_res.data.get("results", list_res.data)), 1)

        # Remove from wishlist by product_id
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
