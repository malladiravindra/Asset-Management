from django.contrib import admin
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

# Hide the "Token Blacklist" section from /admin/ — purely a UI change.
# The token_blacklist app itself stays installed and fully functional:
# LogoutView (accounts/views.py) calls RefreshToken(...).blacklist(), and
# SIMPLE_JWT's ROTATE_REFRESH_TOKENS/BLACKLIST_AFTER_ROTATION (settings.py)
# blacklists the old refresh token on every rotation. Unregistering here
# only removes admin.site's UI for browsing those tables by hand — it
# doesn't touch the tables, the app, or either of those code paths.
admin.site.unregister(OutstandingToken)
admin.site.unregister(BlacklistedToken)

from django.contrib.auth.models import Group, User
from django.contrib.auth.admin import UserAdmin
from .models import AccountUser

# Unregister default User model from admin
try:
    admin.site.unregister(User)
except admin.sites.NotRegistered:
    pass

# Groups ARE the application's roles, but they are managed in the app's
# Roles & Permissions screen (/api/accounts/roles/), which validates
# grants, keeps RoleProfile in step and writes the audit trail. Editing
# them through the stock Groups admin would skip all of that, so it stays
# hidden (also keeping the sidebar to the four sections in
# organization/admin_site.py). django.contrib.auth permission checks are
# untouched.
admin.site.unregister(Group)

# Register AccountUser proxy model using UserAdmin
@admin.register(AccountUser)
class AccountUserAdmin(UserAdmin):
    pass
