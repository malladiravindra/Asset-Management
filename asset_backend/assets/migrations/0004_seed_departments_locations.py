from django.db import migrations

# Matches the frontend's own mock lists exactly, so the Add Asset form's
# name->id lookup (Asset-Management/src/lib/api.ts) actually finds a match:
# - departments/data.ts INITIAL_DEPARTMENTS
# - locations/data.ts INITIAL_LOCATIONS
DEPARTMENTS = [
    "Engineering", "Finance", "Operations", "Sales", "Marketing", "Human Resources",
]

LOCATIONS = [
    "HQ - Floor 1", "HQ - Floor 2", "HQ - Floor 3",
    "Mumbai Branch", "Pune Branch", "Bangalore Branch", "Remote",
]


def seed(apps, schema_editor):
    Department = apps.get_model("assets", "Department")
    Location = apps.get_model("assets", "Location")
    for name in DEPARTMENTS:
        Department.objects.get_or_create(name=name)
    for name in LOCATIONS:
        Location.objects.get_or_create(name=name)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("assets", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed, noop_reverse),
    ]
