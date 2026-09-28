from django.urls import path

from .views import (
    DepartmentDetailAPIView,
    DepartmentListAPIView,
    EmployeeDetailAPIView,
    EmployeeListAPIView,
    LocationDetailAPIView,
    LocationListAPIView,
    SummaryAPIView,
    VendorDetailAPIView,
    VendorListAPIView,
    VendorSummaryAPIView,
)

urlpatterns = [
    # Static sub-paths listed before the <int:pk> patterns — same
    # defensive ordering used in assets/urls.py.
    path("summary/", SummaryAPIView.as_view(), name="org-summary"),

    path("employees/<int:pk>/", EmployeeDetailAPIView.as_view(), name="org-employee-detail"),
    path("employees/", EmployeeListAPIView.as_view(), name="org-employee-list"),

    path("departments/<int:pk>/", DepartmentDetailAPIView.as_view(), name="org-department-detail"),
    path("departments/", DepartmentListAPIView.as_view(), name="org-department-list"),

    path("locations/<int:pk>/", LocationDetailAPIView.as_view(), name="org-location-detail"),
    path("locations/", LocationListAPIView.as_view(), name="org-location-list"),

    path("vendors/summary/", VendorSummaryAPIView.as_view(), name="org-vendor-summary"),
    path("vendors/<int:pk>/", VendorDetailAPIView.as_view(), name="org-vendor-detail"),
    path("vendors/", VendorListAPIView.as_view(), name="org-vendor-list"),
]
