from django.conf import settings
from django.contrib.auth.models import Group, User
from django.db import models

class EmailOTP(models.Model):
	# Login is password-only (see accounts/views.py LoginView) — OTP exists
	# only for the forgot-password flow, so this is the sole purpose today.
	PASSWORD_RESET = "password_reset"
	PURPOSES = ((PASSWORD_RESET, "Password reset"),)

	user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
	purpose = models.CharField(max_length=20, choices=PURPOSES)
	code_hash = models.CharField(max_length=128)
	created_at = models.DateTimeField(auto_now_add=True)
	expires_at = models.DateTimeField()
	attempts = models.PositiveSmallIntegerField(default=0)
	verified_at = models.DateTimeField(null=True, blank=True)
	used_at = models.DateTimeField(null=True, blank=True)
	last_sent_at = models.DateTimeField(auto_now_add=True)


class AccountUser(User):
    class Meta:
        proxy = True
        app_label = "accounts"
        verbose_name = "Account"
        verbose_name_plural = "Accounts"


class RoleProfile(models.Model):
    """Metadata Django's Group lacks. A role IS a django.contrib.auth Group:
    its name lives on Group.name, its permissions on Group.permissions and
    its members on User.groups — nothing here duplicates those. This row
    only adds what the Roles & Permissions screen needs on top.

    An inactive role keeps its members and permissions but grants nothing:
    accounts.backends.RoleAwareModelBackend skips inactive roles when it
    resolves a user's group permissions."""

    group = models.OneToOneField(Group, on_delete=models.CASCADE, related_name="role_profile")
    description = models.CharField(max_length=255, blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Role profile"

    def __str__(self):
        return f"Role profile: {self.group.name}"

