from django.urls import path

from .views import ReportAssetListAPIView, ReportSummaryAPIView

urlpatterns = [
    # Summary / analytics endpoint — the main GET the Reports page calls.
    path("", ReportSummaryAPIView.as_view(), name="report-summary"),

    # Read-only asset rows for the Reports CSV export.
    path("assets/", ReportAssetListAPIView.as_view(), name="report-asset-list"),
]
