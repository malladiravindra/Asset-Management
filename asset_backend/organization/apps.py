from django.apps import AppConfig


class OrganizationConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'organization'

    def ready(self):
        # Regroups the admin sidebar into Accounts/Assets/Catalog/Organization
        # — see organization/admin_site.py for why and how. Applied here
        # (not in admin.py) because it needs every app's admin.py to have
        # already registered its models first: 'organization' is the last
        # app in INSTALLED_APPS, so by the time its ready() runs, django.
        # contrib.admin's own ready() (first in the list) has already
        # autodiscovered and imported every app's admin.py, including this
        # one's.
        from django.contrib import admin

        from .admin_site import install

        install(admin.site)
