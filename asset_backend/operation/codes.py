import random
import re

from .models import Accessory, SoftwareLicense

# Same "scan existing, pick max(existing)+1" approach as assets.codes.
# next_asset_code / organization.codes.next_employee_id — a deleted
# record's number is never reused.


def next_repair_id():
    """Generate the next repair_id, e.g. 'REP-027'. The prefix comes from
    Settings > Repairs (SystemSettings.repair_number_prefix, default 'REP')."""
    from system_settings.services import get_system_settings

    from .models import RepairRecord

    prefix = f"{get_system_settings().repair_number_prefix}-"
    existing = RepairRecord.objects.filter(repair_id__startswith=prefix).values_list(
        "repair_id", flat=True
    )
    max_seq = 0
    for value in existing:
        suffix = value[len(prefix):]
        if suffix.isdigit():
            max_seq = max(max_seq, int(suffix))
    return f"{prefix}{max_seq + 1:03d}"


def next_license_id():
    """Generate the next license_id, e.g. 'LIC-015'."""
    prefix = "LIC-"
    existing = SoftwareLicense.objects.filter(license_id__startswith=prefix).values_list(
        "license_id", flat=True
    )
    max_seq = 0
    for value in existing:
        suffix = value[len(prefix):]
        if suffix.isdigit():
            max_seq = max(max_seq, int(suffix))
    return f"{prefix}{max_seq + 1:03d}"


def sku_prefix_for(category_name):
    """Derive a short SKU prefix from a category name, e.g. 'Mouse' -> 'MS',
    'Cable' -> 'CB'. Mirrors the frontend's own skuPrefixFor() (see
    components/accessories/data.ts) so a server-generated SKU looks the
    same as one the old client-side logic would have produced."""
    known = {
        "Mouse": "MS", "Keyboard": "KB", "Dock": "DK", "Headset": "HS",
        "Adapter": "AD", "Cable": "CB", "RAM": "RM", "Webcam": "WC", "Bag": "BG",
    }
    if category_name in known:
        return known[category_name]
    words = [w for w in re.split(r"\s+", category_name.strip()) if w]
    if len(words) >= 2:
        return (words[0][0] + words[1][0]).upper()
    return (category_name[:2] or "AC").upper()


def next_accessory_sku(category_name):
    """Generate a default SKU, e.g. 'MS-004', when the Add Accessory form
    leaves the field blank."""
    prefix = sku_prefix_for(category_name) + "-"
    existing = Accessory.objects.filter(sku__startswith=prefix).values_list("sku", flat=True)
    max_seq = 0
    for value in existing:
        suffix = value[len(prefix):]
        if suffix.isdigit():
            max_seq = max(max_seq, int(suffix))
    return f"{prefix}{max_seq + 1:03d}"


def random_license_key():
    """Generate a default license key, e.g. '4F3A-9C21-00B4-7E1D', when the
    Add Software License form leaves the field blank."""
    return "-".join(f"{random.randint(0, 0xFFFF):04X}" for _ in range(4))
