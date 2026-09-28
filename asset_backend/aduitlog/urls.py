from django.urls import path

from .views import AuditLogDetailAPIView, AuditLogListCreateAPIView

# Included under 'api/audit-logs/' in the root urls.py:
#   path('api/audit-logs/', include('aduitlog.urls'))
#
# Resolves to:
#   GET/POST         /api/audit-logs/
#   GET/PUT/PATCH/DELETE /api/audit-logs/<id>/

urlpatterns = [
    path("<int:pk>/", AuditLogDetailAPIView.as_view(), name="audit-log-detail"),
    path("", AuditLogListCreateAPIView.as_view(), name="audit-log-list"),
]
