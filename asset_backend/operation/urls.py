from django.urls import path

from .views import (
    AccessoryAssignmentListAPIView,
    AccessoryDetailAPIView,
    AccessoryListCreateAPIView,
    MaintenanceDetailAPIView,
    MaintenanceListCreateAPIView,
    RepairDetailAPIView,
    RepairListCreateAPIView,
    SoftwareLicenseDetailAPIView,
    SoftwareLicenseListCreateAPIView,
)

# Mounted at 'api/operation/' in the root urls.py — see
# asset_management_backend/urls.py.

urlpatterns = [
    path("maintenance/<int:pk>/", MaintenanceDetailAPIView.as_view(), name="maintenance-detail"),
    path("maintenance/", MaintenanceListCreateAPIView.as_view(), name="maintenance-list"),

    path("repairs/<int:pk>/", RepairDetailAPIView.as_view(), name="repair-detail"),
    path("repairs/", RepairListCreateAPIView.as_view(), name="repair-list"),

    path("accessories/<int:pk>/", AccessoryDetailAPIView.as_view(), name="accessory-detail"),
    path("accessories/", AccessoryListCreateAPIView.as_view(), name="accessory-list"),

    path("accessory-assignments/", AccessoryAssignmentListAPIView.as_view(), name="accessory-assignment-list"),

    path("software-licenses/<int:pk>/", SoftwareLicenseDetailAPIView.as_view(), name="software-license-detail"),
    path("software-licenses/", SoftwareLicenseListCreateAPIView.as_view(), name="software-license-list"),
]
