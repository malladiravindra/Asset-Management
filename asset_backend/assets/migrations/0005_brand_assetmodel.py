# This migration used to CreateModel a local Brand/AssetModel here (with a
# FK to a local Category). Both models have since moved to the catalog app
# permanently — see catalog/migrations/0001_initial.py — and the assets
# app's squashed 0001_initial never defines them locally at all, so there's
# nothing left for this step to do. Left in the chain (rather than deleted)
# only to keep 0004 -> 0006's dependency numbering intact; it is a no-op.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('assets', '0004_seed_departments_locations'),
    ]

    operations = []
