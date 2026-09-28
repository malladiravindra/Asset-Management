"""Rename the Person model to Employee.

Written by hand (NOT by `makemigrations`) — the autodetector could not be
made to recognize this as a rename via piped/non-interactive input and
instead proposed DeleteModel(Person) + CreateModel(Employee), which would
have dropped the table and lost every existing employee record. This
migration uses RenameModel instead, which performs an in-place table rename
(assets_person -> assets_employee) and preserves every row, every id, and
every existing foreign key pointing at it (Asset.assigned_to,
operations.Assignment.person, operations.PurchaseOrder.requested_by) with
zero data loss.

Also updates the related_name on Employee.department/Employee.location from
"people" to "employees" to match the renamed model (Department.employees /
Location.employees instead of Department.people / Location.people) — a
Python-level state change only, no column is added/removed/altered.
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('assets', '0011_asset_purchase_date'),
        # operations.0001_initial creates Assignment/PurchaseOrder with a FK
        # to 'assets.Person' but only declares a dependency on assets.0010
        # (whatever the assets app looked like when it was first written) —
        # it has no reason to know a LATER assets migration would rename the
        # model that FK points at. Without this explicit dependency, a fresh
        # database build (e.g. `manage.py test`) is free to run this rename
        # before operations.0001_initial, which then fails to resolve
        # 'assets.Person' (already renamed) while trying to create those
        # tables. Forcing operations.0001_initial to apply first guarantees
        # Person still exists in migration state when it runs.
        ('operations', '0001_initial'),
    ]

    operations = [
        migrations.RenameModel(
            old_name='Person',
            new_name='Employee',
        ),
        migrations.AlterField(
            model_name='employee',
            name='department',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='employees', to='assets.department',
            ),
        ),
        migrations.AlterField(
            model_name='employee',
            name='location',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='employees', to='assets.location',
            ),
        ),
    ]
