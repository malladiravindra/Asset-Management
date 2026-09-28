# Hand-written squashed initial migration for the assets app. Department,
# Location, Person, and Asset previously came from several migrations
# (0001-0006) — several of which also created/altered a local
# Category/Brand/AssetModel that has since moved to the catalog app
# entirely, and shouldn't appear anywhere in this app's history. This
# migration recreates the app's *current* schema in one step, with Asset's
# category/brand/model FKs pointing at catalog from the very first
# migration — there's no longer a local model for them to ever have
# pointed at instead.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('catalog', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Department',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100, unique=True)),
            ],
            options={
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='Location',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100, unique=True)),
            ],
            options={
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='Person',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=150)),
                ('email', models.EmailField(blank=True, max_length=254)),
                ('is_active', models.BooleanField(default=True)),
                ('department', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='people', to='assets.department')),
            ],
            options={
                'verbose_name_plural': 'people',
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='Asset',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('asset_code', models.CharField(max_length=50, unique=True)),
                ('name', models.CharField(max_length=200)),
                ('serial_number', models.CharField(max_length=100, unique=True)),
                ('status', models.CharField(choices=[('Assigned', 'Assigned'), ('Available', 'Available'), ('In Repair', 'In Repair'), ('Reserved', 'Reserved'), ('Maintenance', 'Maintenance')], default='Available', max_length=20)),
                ('condition', models.CharField(choices=[('Good', 'Good'), ('Fair', 'Fair'), ('Poor', 'Poor')], default='Good', max_length=10)),
                ('cost', models.DecimalField(decimal_places=2, help_text='Original purchase cost.', max_digits=12)),
                ('current_value', models.DecimalField(blank=True, decimal_places=2, help_text="Present-day valuation, used for the Catalog module's per-category/brand/model 'current asset value' stat. Defaults to cost when left blank.", max_digits=12, null=True)),
                ('warranty_status', models.CharField(choices=[('Active', 'Active'), ('Expiring', 'Expiring'), ('Expired', 'Expired')], default='Active', max_length=10)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('category', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='assets', to='catalog.category')),
                ('brand', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='assets', to='catalog.brand')),
                ('model', models.ForeignKey(blank=True, help_text='Catalog model this asset is a unit of, e.g. "MacBook Pro 14".', null=True, on_delete=django.db.models.deletion.PROTECT, related_name='assets', to='catalog.assetmodel')),
                ('department', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='assets', to='assets.department')),
                ('location', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='assets', to='assets.location')),
                ('assigned_to', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='assigned_assets', to='assets.person')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
