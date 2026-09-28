"""Notifications API — always scoped to request.user; there is no way to
read or change another user's notifications (their rows are simply not in
the queryset, so the detail route answers 404).

  GET   /api/notifications/             newest first, paginated, + unread_count
  PATCH /api/notifications/<id>/read/   mark one read
  POST  /api/notifications/read-all/    mark all of the caller's unread read

Notifications are only ever created server-side (notifications.services).
"""
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notification
from .serializers import NotificationSerializer


class NotificationPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


def own_notifications(request):
    return Notification.objects.filter(recipient=request.user)


class NotificationListAPIView(APIView):
    """?is_read=true|false filters; unread_count is always the caller's
    total unread, independent of the filter and the page."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = own_notifications(request)
        is_read = request.query_params.get("is_read")
        if is_read in ("true", "false"):
            queryset = queryset.filter(is_read=is_read == "true")
        paginator = NotificationPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        response = paginator.get_paginated_response(NotificationSerializer(page, many=True).data)
        response.data["unread_count"] = own_notifications(request).filter(is_read=False).count()
        return response


class NotificationReadAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        notification = get_object_or_404(own_notifications(request), pk=pk)
        if not notification.is_read:
            notification.is_read = True
            notification.read_at = timezone.now()
            notification.save(update_fields=["is_read", "read_at"])
        return Response(NotificationSerializer(notification).data)


class NotificationReadAllAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        updated = own_notifications(request).filter(is_read=False).update(is_read=True, read_at=timezone.now())
        return Response({"updated": updated, "unread_count": 0})
