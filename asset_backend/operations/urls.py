from django.urls import path

from .views import (
    AssignmentDetailAPIView,
    AssignmentListAPIView,
    PurchaseOrderDetailAPIView,
    PurchaseOrderListAPIView,
    ReturnDetailAPIView,
    ReturnListAPIView,
)

urlpatterns = [
    # Static/nested sub-paths listed before the <int:pk> patterns — same
    # defensive ordering used in assets/urls.py and organization/urls.py.
    path("purchase-orders/<int:pk>/", PurchaseOrderDetailAPIView.as_view(), name="purchase-order-detail"),
    path("purchase-orders/", PurchaseOrderListAPIView.as_view(), name="purchase-order-list"),

    path("assignments/<int:pk>/", AssignmentDetailAPIView.as_view(), name="assignment-detail"),
    path("assignments/", AssignmentListAPIView.as_view(), name="assignment-list"),

    # Returning an assignment is POST returns/ with {"assignment": <id>} —
    # the single endpoint for that operation.
    path("returns/<int:pk>/", ReturnDetailAPIView.as_view(), name="return-detail"),
    path("returns/", ReturnListAPIView.as_view(), name="return-list"),
]
