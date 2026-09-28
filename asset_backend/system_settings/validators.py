"""Password policy driven by Settings > Security.

Registered in AUTH_PASSWORD_VALIDATORS (asset_backend/settings.py) in place
of Django's MinimumLengthValidator, so every existing password-setting path
that calls django.contrib.auth.password_validation.validate_password —
RegisterSerializer and ResetPasswordView — enforces the configured policy.
Settings are read at validation time (not at startup), so a saved change
applies to the very next password set.
"""
import re

from django.core.exceptions import ValidationError


class SettingsPasswordPolicyValidator:
    def _policy(self):
        from .services import get_system_settings

        return get_system_settings()

    def validate(self, password, user=None):
        s = self._policy()
        errors = []
        if len(password) < s.minimum_password_length:
            errors.append(
                ValidationError(
                    f"This password is too short. It must contain at least {s.minimum_password_length} characters.",
                    code="password_too_short",
                )
            )
        rules = (
            (s.password_require_uppercase, r"[A-Z]", "an uppercase letter", "password_no_upper"),
            (s.password_require_lowercase, r"[a-z]", "a lowercase letter", "password_no_lower"),
            (s.password_require_number, r"\d", "a number", "password_no_number"),
            (s.password_require_special, r"[^A-Za-z0-9]", "a special character", "password_no_special"),
        )
        for required, pattern, label, code in rules:
            if required and not re.search(pattern, password):
                errors.append(ValidationError(f"This password must contain at least {label}.", code=code))
        if errors:
            raise ValidationError(errors)

    def get_help_text(self):
        s = self._policy()
        parts = [f"at least {s.minimum_password_length} characters"]
        for required, label in (
            (s.password_require_uppercase, "an uppercase letter"),
            (s.password_require_lowercase, "a lowercase letter"),
            (s.password_require_number, "a number"),
            (s.password_require_special, "a special character"),
        ):
            if required:
                parts.append(label)
        return "Your password must contain " + ", ".join(parts) + "."
