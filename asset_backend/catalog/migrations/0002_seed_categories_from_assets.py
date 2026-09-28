# This migration used to copy Category rows out of the assets app's
# (by-then-legacy) Category table into this one, as part of the one-time
# move. assets' migration history has since been squashed and never
# defines a local Category at all, so there's no longer an "assets.Category"
# to copy from — Category has only ever lived here. Left in the chain
# (rather than deleted) only to keep migration numbering stable; it is a
# no-op.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0001_initial'),
    ]

    operations = []
