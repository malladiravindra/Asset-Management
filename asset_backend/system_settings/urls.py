from django.urls import path

from .views import SystemSettingsAPIView, TestEmailAPIView

# Included under 'api/settings/' in the root urls.py:
#   path('api/settings/', include('system_settings.urls'))
#
# Resolves to:
#   GET/PUT/PATCH  /api/settings/
#   POST           /api/settings/test-email/
#
# Singleton resource — no <int:pk> route; there is only ever one settings row.

urlpatterns = [
    path("test-email/", TestEmailAPIView.as_view(), name="settings-test-email"),
    path("", SystemSettingsAPIView.as_view(), name="system-settings"),
]
