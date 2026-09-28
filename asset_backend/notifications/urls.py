from django.urls import path

from .views import NotificationListAPIView, NotificationReadAllAPIView, NotificationReadAPIView

# Included under 'api/notifications/' in the root urls.py.
urlpatterns = [
    path("read-all/", NotificationReadAllAPIView.as_view(), name="notification-read-all"),
    path("<int:pk>/read/", NotificationReadAPIView.as_view(), name="notification-read"),
    path("", NotificationListAPIView.as_view(), name="notification-list"),
]
