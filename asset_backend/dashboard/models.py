from django.db import models

# No models of its own — the Dashboard API (see views.py) is a pure,
# read-only aggregation layer over models that already exist elsewhere
# (assets.Asset/Department, catalog.Category, operation.MaintenanceRecord/
# RepairRecord, aduitlog.AuditLog). Same pattern as the reports app.
