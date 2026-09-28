"""Shared, reusable normalization/validation for contact-info fields
(email, Indian mobile numbers) — the ONE place this logic lives across the
whole project (accounts, assets, organization all import from here). Every
serializer that accepts an email or phone number should go through
accounts.fields.NormalizedEmailField / IndianPhoneField (which call the
functions below) instead of writing its own regex or strip()/lower()
inline — see the audit that introduced this module for the several places
that used to do exactly that.
"""
import re

from rest_framework import serializers

PHONE_DIGIT_COUNT = 10


def normalize_email(value):
    """Trim + lowercase. The single place every email address gets
    normalized before it's compared or stored, so "User@Example.com " and
    "user@example.com" are always treated as the same address everywhere
    in the project (Accounts, Employees, Vendors)."""
    if value is None:
        return value
    return value.strip().lower()


def normalize_indian_phone(value):
    """Accepts the common ways a phone number gets typed —
    spaces/dashes/parentheses as separators, an optional '+91' or '91'
    country code, or a leading trunk '0' — and returns the bare 10-digit
    number for storage. Raises a ValidationError (consistent DRF-style
    message) if what's left over isn't exactly 10 digits.

    Blank input is passed through unchanged so an optional phone field
    (e.g. Vendor.phone) can stay blank without raising — required/blank
    enforcement is the field's own job, not this function's.
    """
    raw = (value or "").strip()
    if not raw:
        return raw

    cleaned = re.sub(r"[\s\-().]", "", raw)

    if cleaned.startswith("+91"):
        cleaned = cleaned[3:]
    elif cleaned.startswith("91") and len(cleaned) == 12:
        cleaned = cleaned[2:]
    elif cleaned.startswith("0") and len(cleaned) == 11:
        cleaned = cleaned[1:]

    if not cleaned.isdigit() or len(cleaned) != PHONE_DIGIT_COUNT:
        raise serializers.ValidationError(
            "Enter a valid 10-digit mobile number, e.g. 9876543210 (optionally with a +91 prefix)."
        )
    return cleaned
