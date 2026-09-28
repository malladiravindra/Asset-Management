from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('assets', '0010_location_created_at_location_updated_at_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='asset',
            name='purchase_date',
            field=models.DateField(
                blank=True,
                null=True,
                help_text=(
                    'Date the asset was originally purchased. Used by Reports for the '
                    '12-month acquisition trend. Nullable so existing records are unaffected.'
                ),
            ),
        ),
    ]
