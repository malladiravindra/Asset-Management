from datetime import date

from .models import Asset


def next_asset_code(category):
    """Generate the next asset code, e.g. 'AF-LT-0042'.

    Prefix, format and starting number come from Settings > Asset Management
    (system_settings.SystemSettings: asset_code_prefix, asset_number_format,
    starting_asset_number) — defaults 'AF', '{PREFIX}-{CATEGORY}-{NUMBER}', 1.
    {CATEGORY} is the category's code field (2-4 letter tag like 'LT' for
    Laptops), or an abbreviation derived from its name. Scans existing codes
    sharing the rendered prefix for the highest sequence number and picks
    max(existing) + 1, so a deleted asset's code isn't reused — same approach
    as organization.codes.next_employee_id."""
    from system_settings.services import get_system_settings, next_sequence, render_code_prefix

    # Get the category code, or derive a 2-3 letter abbreviation from the name
    if category.code:
        cat_code = category.code
    else:
        # Derive from name: take first 2-3 uppercase letters
        cat_code = "".join(c.upper() for c in category.name if c.isalpha())[:3]
        if len(cat_code) < 2:
            cat_code = category.name[:2].upper()

    s = get_system_settings()
    # e.g. "AF-LT-" for prefix "AF", category code "LT"
    prefix_pattern = render_code_prefix(
        s.asset_number_format, prefix=s.asset_code_prefix, category=cat_code, year=date.today().year
    )

    existing_codes = Asset.objects.filter(
        asset_code__startswith=prefix_pattern
    ).values_list("asset_code", flat=True)

    seq = next_sequence(existing_codes, prefix_pattern, floor=s.starting_asset_number - 1)
    return f"{prefix_pattern}{seq:04d}"
