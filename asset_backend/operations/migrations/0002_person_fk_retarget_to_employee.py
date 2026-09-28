"""Update Assignment.person and PurchaseOrder.requested_by to point at the
renamed assets.Employee model (was assets.Person).

Field NAMES are unchanged (still `person` / `requested_by`, by deliberate
choice — only the model class they reference was renamed) — this migration
only updates which table the existing foreign key column points at, via
Django's migration state. Since assets.Person and assets.Employee are the
SAME underlying table (see assets/migrations/0012_rename_person_to_employee's
RenameModel), no data is affected: every existing person_id/requested_by_id
value on Assignment/PurchaseOrder rows continues to reference the exact same
rows, now under the Employee model.
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('operations', '0001_initial'),
        ('assets', '0012_rename_person_to_employee'),
    ]

    operations = [
        migrations.AlterField(
            model_name='assignment',
            name='person',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='assignments', to='assets.employee',
            ),
        ),
        migrations.AlterField(
            model_name='purchaseorder',
            name='requested_by',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='purchase_orders', to='assets.employee',
            ),
        ),
    ]
