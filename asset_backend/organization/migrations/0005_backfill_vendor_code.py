from django.db import migrations

PREFIX = "VEN-"


def backfill_vendor_codes(apps, schema_editor):
    """Give every vendor without a (unique) code a server-generated one
    (VEN-###), continuing after the highest existing VEN- number."""
    Vendor = apps.get_model("organization", "Vendor")
    max_seq = 0
    for code in Vendor.objects.filter(vendor_code__startswith=PREFIX).values_list("vendor_code", flat=True):
        suffix = code[len(PREFIX):]
        if suffix.isdigit():
            max_seq = max(max_seq, int(suffix))
    # Blank codes, plus later duplicates of an already-used code (the first
    # vendor keeps it), get a fresh code so the unique constraint can apply.
    seen = set()
    for vendor in Vendor.objects.order_by("id"):
        if vendor.vendor_code and vendor.vendor_code not in seen:
            seen.add(vendor.vendor_code)
            continue
        max_seq += 1
        vendor.vendor_code = f"{PREFIX}{max_seq:03d}"
        seen.add(vendor.vendor_code)
        vendor.save(update_fields=["vendor_code"])


class Migration(migrations.Migration):
    dependencies = [
        ("organization", "0004_vendor_address_vendor_city_vendor_company_name_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_vendor_codes, migrations.RunPython.noop),
    ]
