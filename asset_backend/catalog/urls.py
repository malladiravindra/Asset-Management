from django.urls import path

from .views import (
    BrandAPIView,
    CatalogSearchAPIView,
    CatalogSummaryAPIView,
    CategoryAPIView,
    ModelAPIView,
)

urlpatterns = [
    # Listed ahead of the router include — not strictly required (neither
    # name collides with a registered prefix) but kept explicit/defensive.
    path("search/", CatalogSearchAPIView.as_view(), name="catalog-search"),
    path("summary/", CatalogSummaryAPIView.as_view(), name="catalog-summary"),
    path("categories/<int:pk>/", CategoryAPIView.as_view(), name="catalog-category-detail"),
    path("categories/", CategoryAPIView.as_view(), name="catalog-category-list"),
    path("brands/<int:pk>/", BrandAPIView.as_view(), name="catalog-brand-detail"),
    path("brands/", BrandAPIView.as_view(), name="catalog-brand-list"),
    path("models/<int:pk>/", ModelAPIView.as_view(), name="catalog-model-detail"),
    path("models/", ModelAPIView.as_view(), name="catalog-model-list"),
]
