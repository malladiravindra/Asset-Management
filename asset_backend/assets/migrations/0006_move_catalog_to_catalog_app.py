# This migration used to repoint Asset.category at catalog.Category, add
# Asset.brand/model/current_value, and drop the (by-then-unused) local
# Category/Brand/AssetModel models. The squashed 0001_initial now creates
# Asset with all of that already in place — category/brand/model FK'd to
# catalog from the start — so there's nothing left for this step to do.
# Left in the chain (rather than deleted) only to keep migration numbering
# stable for anyone with these files already applied; it is a no-op.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('assets', '0005_brand_assetmodel'),
    ]

    operations = []
