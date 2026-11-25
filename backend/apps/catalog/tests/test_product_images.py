"""Tests for multi-image Product Gallery (create, upload, set primary, delete, limits & RBAC)."""

from decimal import Decimal
from io import BytesIO
from pathlib import Path
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from apps.catalog.services import create_category, create_unit
from apps.rbac.models import Permission, Role
from apps.rbac.services import sync_default_rbac

User = get_user_model()


def _make_png(name: str, color=(115, 103, 240)) -> SimpleUploadedFile:
    buf = BytesIO()
    Image.new("RGB", (80, 80), color=color).save(buf, format="PNG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")


class ProductMultiImageGalleryTests(APITestCase):
    def setUp(self):
        self.tmp_media = tempfile.TemporaryDirectory(prefix="pos_gallery_media_")
        self.addCleanup(self.tmp_media.cleanup)

        sync_default_rbac()

        self.admin = User.objects.create_superuser(
            username="gallery_admin",
            email="gallery_admin@example.com",
            password="StrongPassword123!",
        )
        self.admin.roles.add(Role.objects.get(slug="super_admin"))

        viewer_role = Role.objects.create(name="Product Viewer Only", slug="prod-viewer-only")
        viewer_role.permissions.set(Permission.objects.filter(code__in=["products.view"]))
        self.viewer = User.objects.create_user(
            username="gallery_viewer",
            email="gallery_viewer@example.com",
            password="StrongPassword123!",
        )
        self.viewer.roles.add(viewer_role)

        self.category = create_category(actor=self.admin, name="Coffee")
        self.unit = create_unit(actor=self.admin, name="Cup", abbreviation="cup")

    def test_create_product_with_multiple_images_manage_primary_and_delete(self):
        with override_settings(MEDIA_ROOT=Path(self.tmp_media.name)):
            self.client.force_authenticate(user=self.admin)

            # Create product with 2 gallery images at once
            create_res = self.client.post(
                "/api/v1/products/",
                {
                    "sku": "GAL-001",
                    "name": "Iced Mocha",
                    "category": self.category.id,
                    "unit": self.unit.id,
                    "purchase_cost": "1.20",
                    "selling_price": "3.00",
                    "images": [_make_png("front.png", (10, 20, 30)), _make_png("side.png", (40, 50, 60))],
                },
                format="multipart",
            )
            self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
            self.assertEqual(create_res.data["images_count"], 2)
            self.assertEqual(len(create_res.data["images"]), 2)
            self.assertTrue(create_res.data["images"][0]["is_primary"])
            self.assertEqual(create_res.data["image_url"], create_res.data["images"][0]["image_url"])

            product_id = create_res.data["id"]
            first_img_id = create_res.data["images"][0]["id"]
            second_img_id = create_res.data["images"][1]["id"]

            # Upload 1 additional image via dedicated endpoint
            add_res = self.client.post(
                f"/api/v1/products/{product_id}/images/",
                {"images": [_make_png("top.png", (70, 80, 90))]},
                format="multipart",
            )
            self.assertEqual(add_res.status_code, status.HTTP_201_CREATED)
            self.assertEqual(add_res.data["images_count"], 3)

            # Promote second image to primary
            prim_res = self.client.post(
                f"/api/v1/products/{product_id}/images/{second_img_id}/set-primary/"
            )
            self.assertEqual(prim_res.status_code, status.HTTP_200_OK)
            self.assertEqual(prim_res.data["images"][0]["id"], second_img_id)
            self.assertTrue(prim_res.data["images"][0]["is_primary"])
            self.assertEqual(prim_res.data["image_url"], prim_res.data["images"][0]["image_url"])

            # Delete current primary -> another image auto-promotes to primary
            del_res = self.client.delete(f"/api/v1/products/{product_id}/images/{second_img_id}/")
            self.assertEqual(del_res.status_code, status.HTTP_200_OK)
            self.assertEqual(del_res.data["images_count"], 2)
            self.assertTrue(any(img["is_primary"] for img in del_res.data["images"]))

            # Also supports PATCH with delete_image_ids + new images in one request
            patch_res = self.client.patch(
                f"/api/v1/products/{product_id}/",
                {
                    "delete_image_ids": [first_img_id],
                    "images": [_make_png("extra.png", (100, 110, 120))],
                },
                format="multipart",
            )
            self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
            self.assertEqual(patch_res.data["images_count"], 2)

            # Viewer without products.edit gets 403 on gallery mutations
            self.client.force_authenticate(user=self.viewer)
            forbid_res = self.client.post(
                f"/api/v1/products/{product_id}/images/",
                {"images": [_make_png("blocked.png")]},
                format="multipart",
            )
            self.assertEqual(forbid_res.status_code, status.HTTP_403_FORBIDDEN)
