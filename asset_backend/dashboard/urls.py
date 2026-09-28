from django.urls import path

from .views import DashboardAPIView

# Included under 'api/dashboard/' in the root urls.py:
#   path('api/dashboard/', include('dashboard.urls'))
#
# Resolves to:
#   GET /api/dashboard/
#
# Deliberately a single "" route (same pattern as reports.urls' summary
# route) — no <int:pk> pattern needed, this is a read-only aggregate, not
# a per-object CRUD resource.

urlpatterns = [
    path("", DashboardAPIView.as_view(), name="dashboard-summary"),
]
