from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase
from accounts.testing import grant_role

from .models import Brand, Category, Model


class CategoryCRUDTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="tester", password="pw12345!")
        grant_role(self.user)
        self.client.force_authenticate(user=self.user)

    def test_create_list_retrieve_update_delete(self):
        created = self.client.post(
            "/api/catalog/categories/", {"name": "Laptops", "icon": "laptop", "color": "blue"}, format="json"
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        cat_id = created.data["id"]
        self.assertEqual(created.data["asset_count"], 0)

        listed = self.client.get("/api/catalog/categories/")
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(listed.data["count"], 1)

        retrieved = self.client.get(f"/api/catalog/categories/{cat_id}/")
        self.assertEqual(retrieved.status_code, status.HTTP_200_OK)
        self.assertIn("models", retrieved.data)

        updated = self.client.patch(f"/api/catalog/categories/{cat_id}/", {"color": "emerald"}, format="json")
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["color"], "emerald")

        deleted = self.client.delete(f"/api/catalog/categories/{cat_id}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Category.objects.filter(pk=cat_id).exists())

    def test_rejects_duplicate_name_case_insensitive(self):
        Category.objects.create(name="Laptops")
        response = self.client.post("/api/catalog/categories/", {"name": "laptops"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", response.data)

    def test_cannot_delete_category_with_assets(self):
        from assets.models import Asset, Department, Location

        category = Category.objects.create(name="Laptops", code="LT")
        Asset.objects.create(
            asset_code="AF-LT-0001",
            name="Test laptop",
            category=category,
            serial_number="DL111111111",
            department=Department.objects.create(name="IT"),
            location=Location.objects.create(name="HQ"),
            cost=1000,
        )
        response = self.client.delete(f"/api/catalog/categories/{category.id}/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Category.objects.filter(pk=category.id).exists())


class BrandCRUDTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="tester", password="pw12345!")
        grant_role(self.user)
        self.client.force_authenticate(user=self.user)

    def test_create_list_update_delete(self):
        created = self.client.post("/api/catalog/brands/", {"name": "Dell"}, format="json")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        brand_id = created.data["id"]

        listed = self.client.get("/api/catalog/brands/")
        self.assertEqual(listed.data["count"], 1)

        updated = self.client.patch(f"/api/catalog/brands/{brand_id}/", {"description": "PCs"}, format="json")
        self.assertEqual(updated.status_code, status.HTTP_200_OK)

        deleted = self.client.delete(f"/api/catalog/brands/{brand_id}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)

    def test_rejects_duplicate_name(self):
        Brand.objects.create(name="Dell")
        response = self.client.post("/api/catalog/brands/", {"name": "Dell"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ModelCRUDTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="tester", password="pw12345!")
        grant_role(self.user)
        self.client.force_authenticate(user=self.user)
        self.category = Category.objects.create(name="Laptops")
        self.brand = Brand.objects.create(name="Dell")

    def test_create_requires_category_and_brand(self):
        response = self.client.post("/api/catalog/models/", {"name": "Latitude 5440"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("category", response.data)
        self.assertIn("brand", response.data)

    def test_create_list_update_delete(self):
        created = self.client.post(
            "/api/catalog/models/",
            {"name": "Latitude 5440", "category": self.category.id, "brand": self.brand.id},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        model_id = created.data["id"]
        self.assertEqual(created.data["category_name"], "Laptops")
        self.assertEqual(created.data["brand_name"], "Dell")

        listed = self.client.get("/api/catalog/models/")
        self.assertEqual(listed.data["count"], 1)

        updated = self.client.patch(
            f"/api/catalog/models/{model_id}/",
            {"name": "Latitude 5440", "category": self.category.id, "brand": self.brand.id,
             "specifications": {"ram": "16GB"}},
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)

        deleted = self.client.delete(f"/api/catalog/models/{model_id}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Model.objects.filter(pk=model_id).exists())
