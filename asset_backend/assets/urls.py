from django.urls import path

from .views import (
    AssetDetailAPIView,
    AssetExportAPIView,
    AssetImportAPIView,
    AssetListCreateAPIView,
    AssetSummaryAPIView,
)

# Catalog module (Categories/Brands/Models tabs) has moved to the catalog
# app — see catalog/urls.py, mounted at /api/catalog/ in the root urls.py.

# IMPORTANT: These paths are included under 'api/assets/' prefix in the main
# urls.py (see asset_management_backend/urls.py: path('api/assets/', include('assets.urls'))).
# DO NOT add 'assets/' prefix to these paths — that would create a double-prefix
# issue (e.g., /api/assets/assets/export/ instead of /api/assets/export/).
# Paths are resolved relative to the inclusion point. The prefix 'api/assets/'
# is already handled by the root urls.py include(), so just use the final
# sub-path (summary/, export/, import/, etc.) here.

urlpatterns = [
    # Static sub-paths listed before the <int:pk> pattern — not strictly
    # required since <int:pk> only ever matches digits, but kept in this
    # order as the conventional/defensive way to write it.
    path("summary/", AssetSummaryAPIView.as_view(), name="asset-summary"),
    path("export/", AssetExportAPIView.as_view(), name="asset-export"),
    path("import/", AssetImportAPIView.as_view(), name="asset-import"),
    path("<int:pk>/", AssetDetailAPIView.as_view(), name="asset-detail"),
    path("", AssetListCreateAPIView.as_view(), name="asset-list"),

    # Categories, departments, locations and employees are served only by
    # their owning modules: /api/catalog/categories/ and
    # /api/organization/{departments,locations,employees}/. The duplicate
    # /api/assets/<resource>/ routes that used to live here were removed.
]
