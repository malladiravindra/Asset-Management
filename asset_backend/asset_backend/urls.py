"""
URL configuration for asset_backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/accounts/', include('accounts.urls')),
    path('api/audit-logs/', include('aduitlog.urls')),
    path('api/assets/', include('assets.urls')),
    path('api/catalog/', include('catalog.urls')),
    path('api/organization/', include('organization.urls')),
    path('api/operations/', include('operations.urls')),
    path('api/operation/', include('operation.urls')),
    path('api/reports/', include('reports.urls')),
    path('api/dashboard/', include('dashboard.urls')),
    path('api/settings/', include('system_settings.urls')),
    path('api/notifications/', include('notifications.urls')),
]
