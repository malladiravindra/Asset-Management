from django.db import migrations

EMPLOYEE_ID_PREFIX = "EMP-"
EMPLOYEE_ID_START = 1000


def backfill_employee_id(apps, schema_editor):
    """Assign an employee_id to any Person row that predates the field
    (there are none in a fresh dev db, but this keeps a populated db —
    staging, a colleague's local copy — from ending up with employees
    that have no id). Same numbering scheme as
    organization.codes.next_employee_id, applied once here since that
    module isn't safely importable from inside a migration."""
    Person = apps.get_model("assets", "Person")
    seq = EMPLOYEE_ID_START
    for person in Person.objects.filter(employee_id__isnull=True).order_by("id"):
        seq += 1
        person.employee_id = f"{EMPLOYEE_ID_PREFIX}{seq:04d}"
        person.save(update_fields=["employee_id"])


class Migration(migrations.Migration):

    dependencies = [
        ("assets", "0007_asset_vendor_department_color_key_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_employee_id, migrations.RunPython.noop),
    ]
