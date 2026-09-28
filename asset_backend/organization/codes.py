from assets.models import Employee

EMPLOYEE_ID_START = 1000


def next_employee_id():
    """Generate the next employee_id, e.g. 'EMP-1004'. The prefix comes from
    Settings > Organization (SystemSettings.employee_id_prefix, default
    'EMP'). Scans existing ids for the highest sequence number and picks
    max(existing) + 1, so a deleted employee's number isn't reused — same
    approach as assets.codes.next_asset_code."""
    from system_settings.services import get_system_settings, next_sequence

    prefix = f"{get_system_settings().employee_id_prefix}-"
    existing_ids = Employee.objects.filter(
        employee_id__startswith=prefix
    ).values_list("employee_id", flat=True)

    return f"{prefix}{next_sequence(existing_ids, prefix, floor=EMPLOYEE_ID_START):04d}"


VENDOR_CODE_PREFIX = "VEN-"


def next_vendor_code():
    """Generate the next vendor_code, e.g. 'VEN-012' — max(existing) + 1 over
    codes with the VEN- prefix, so a deleted vendor's code isn't reused."""
    from organization.models import Vendor
    from system_settings.services import next_sequence

    existing = Vendor.objects.filter(
        vendor_code__startswith=VENDOR_CODE_PREFIX
    ).values_list("vendor_code", flat=True)
    return f"{VENDOR_CODE_PREFIX}{next_sequence(existing, VENDOR_CODE_PREFIX, floor=0):03d}"
