from django.db import models

# Employee/Department/Location already exist on the assets app (built for the
# Add Asset form's dropdowns) and are reused as-is for the Organization/
# Locations pages — see assets/models.py. This app only owns what's
# genuinely new: Vendor. organization/serializers.py and views.py import the
# assets-app models directly rather than duplicating them here.


class Vendor(models.Model):
    TYPE_DISTRIBUTOR = "distributor"
    TYPE_SOFTWARE_PUBLISHER = "software_publisher"
    TYPE_MARKETPLACE = "marketplace"
    TYPE_RETAILER = "retailer"
    VENDOR_TYPE_CHOICES = [
        (TYPE_DISTRIBUTOR, "Distributor"),
        (TYPE_SOFTWARE_PUBLISHER, "Software Publisher"),
        (TYPE_MARKETPLACE, "Marketplace"),
        (TYPE_RETAILER, "Retailer"),
    ]

    STATUS_ACTIVE = "active"
    STATUS_INACTIVE = "inactive"
    STATUS_CHOICES = [
        (STATUS_ACTIVE, "Active"),
        (STATUS_INACTIVE, "Inactive"),
    ]

    name = models.CharField(max_length=150, unique=True)
    email = models.EmailField(unique=True)
    # Not in the original spec's field list, but the live Add Vendor form
    # captures it — included since this model is being built fresh anyway.
    phone = models.CharField(max_length=30, blank=True, default="")
    vendor_type = models.CharField(max_length=30, choices=VENDOR_TYPE_CHOICES)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_ACTIVE)

    # The Add/Edit Vendor form's "Business Information" / "Address" /
    # "Procurement" / "Notes" sections already collect all of these — they
    # had no matching column here, so the frontend silently discarded them
    # on every page refresh. All optional (blank=True) since existing
    # vendors and the original required-field set are unaffected.
    company_name = models.CharField(max_length=200, blank=True, default="")
    contact_person = models.CharField(max_length=150, blank=True, default="")
    # Server-generated, e.g. "VEN-012" (organization.codes.next_vendor_code).
    vendor_code = models.CharField(max_length=50, unique=True, null=True, blank=True)
    gst_number = models.CharField(max_length=30, blank=True, default="")
    address = models.CharField(max_length=255, blank=True, default="")
    city = models.CharField(max_length=100, blank=True, default="")
    state = models.CharField(max_length=100, blank=True, default="")
    country = models.CharField(max_length=100, blank=True, default="")
    postal_code = models.CharField(max_length=20, blank=True, default="")
    payment_terms = models.CharField(max_length=100, blank=True, default="")
    currency = models.CharField(max_length=10, blank=True, default="INR")
    notes = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        """Every creation path (API, Django admin, seed_vendors, ORM) gets a
        server-generated vendor_code; retried if a concurrent save claimed
        the same code (vendor_code is unique)."""
        if self.vendor_code:
            return super().save(*args, **kwargs)
        from django.db import IntegrityError, transaction

        from .codes import next_vendor_code

        for attempt in range(5):
            self.vendor_code = next_vendor_code()
            try:
                with transaction.atomic():
                    return super().save(*args, **kwargs)
            except IntegrityError:
                if attempt == 4:
                    raise
