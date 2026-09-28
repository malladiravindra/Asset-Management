"""Shared DRF serializer fields for consistent contact-info handling across
every app (accounts, assets, organization) — thin wrappers around
accounts.validators that every email/phone field in the project should use
instead of a one-off EmailField/CharField + hand-written validate_<field>.
"""
from rest_framework import serializers

from .validators import normalize_email, normalize_indian_phone


class NormalizedEmailField(serializers.EmailField):
    """Same format validation as DRF's own EmailField (which already trims
    surrounding whitespace by default), plus a consistent lowercase
    normalization so the same address is never stored with two different
    cases depending on which form/endpoint it came through."""

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        return normalize_email(value)


class IndianPhoneField(serializers.CharField):
    """Accepts common Indian phone input formats (spaces/dashes, an
    optional +91/91 country code or leading trunk 0) and normalizes to a
    bare 10-digit string for storage — see
    accounts.validators.normalize_indian_phone. Raises a validation error
    for anything that isn't exactly 10 digits once normalized; blank input
    is left to the field's own required/allow_blank handling."""

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        return normalize_indian_phone(value)
