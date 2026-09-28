from django.db import models


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    icon = models.CharField(
        max_length=50, blank=True,
        help_text="Icon identifier for the frontend, e.g. 'laptop'.",
    )
    color = models.CharField(
        max_length=30, blank=True,
        help_text="Badge/progress-bar color key, e.g. 'blue'.",
    )
    description = models.TextField(blank=True)
    # Kept from the previous assets.Category (moved here wholesale, not part
    # of the original spec) — assets.codes.next_asset_code() still relies on
    # this to build codes like "AF-LT-0005"; dropping it would break asset
    # creation everywhere it's already wired up.
    code = models.CharField(
        max_length=4, unique=True, blank=True, null=True,
        help_text=(
            "2-4 letter tag used in generated asset codes, e.g. 'LT' for "
            "Laptops -> AF-LT-0005. If left blank, a tag is derived from "
            "the name on the fly (not matching any other category's tag "
            "exactly is not guaranteed in that case)."
        ),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "categories"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Brand(models.Model):
    name = models.CharField(max_length=100, unique=True)
    logo = models.URLField(blank=True)
    description = models.TextField(blank=True)
    color_key = models.CharField(
        max_length=30, blank=True, default="blue",
        help_text="Card/badge color key chosen in the Brands form, e.g. 'blue'.",
    )
    category = models.ForeignKey(
        Category, null=True, blank=True, on_delete=models.SET_NULL, related_name="brands",
        help_text="Optional — only set when this brand is specific to one category.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Model(models.Model):
    """A catalog entry for a specific product model (e.g. "Dell Latitude
    5440") — belongs to one Category and one Brand.

    Directly linked to Asset via Asset.model (a real FK) — unlike the old
    assets-app version of this model, there's no more match-by-name hack."""
    name = models.CharField(max_length=200, unique=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="models")
    brand = models.ForeignKey(Brand, on_delete=models.PROTECT, related_name="models")
    specifications = models.JSONField(
        blank=True, null=True,
        help_text="Free-form spec sheet, e.g. {\"processor\": \"...\", \"ram\": \"16GB\"}.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name
