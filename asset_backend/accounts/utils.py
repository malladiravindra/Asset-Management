"""OTP generation and email delivery for AssetFlow.

Real Gmail SMTP only — nothing here is mocked. The Gmail account configured
in settings.py (EMAIL_HOST_USER / DEFAULT_FROM_EMAIL) is ONLY ever the SMTP
sender. Every OTP is delivered to recipient_list=[user_email] — the affected
user's own registered address — never to the sender account.
"""
import hashlib
import logging
from datetime import timedelta
from secrets import randbelow

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core import signing
from django.core.cache import cache
from django.core.mail import send_mail
from django.utils import timezone

from .models import EmailOTP

logger = logging.getLogger(__name__)


def mask_email(email):
    """Mask an email for logs — never write full addresses to the terminal."""
    local, _, domain = email.partition("@")
    if not domain:
        return "[Email]"
    visible = local[:2]
    return f"{visible}{'*' * max(len(local) - 2, 2)}@{domain}"


def otp_expiry():
    """OTP lifetime — Settings > Security > OTP Expiry (default 5 minutes)."""
    from system_settings.services import get_system_settings

    return timedelta(minutes=get_system_settings().otp_expiry_minutes)


def resend_cooldown():
    """Minimum gap between OTP emails — Settings > Security > OTP Resend
    Interval (default 60 seconds)."""
    from system_settings.services import get_system_settings

    return timedelta(seconds=get_system_settings().otp_resend_interval_seconds)


MAX_ATTEMPTS = 5
MAX_OTP_REQUESTS = 5
OTP_REQUEST_WINDOW = timedelta(minutes=15)


class OTPDeliveryError(Exception):
    """Raised when Gmail SMTP fails to accept an OTP email."""


class OTPRateLimitError(Exception):
    """Raised when a user has requested too many OTPs in the rate-limit window."""


def generate_otp():
    """Cryptographically secure, always-6-digit OTP (zero-padded)."""
    return f"{randbelow(1000000):06d}"


def send_otp_email(user_email, otp, purpose):
    """Email `otp` to `user_email` via Gmail SMTP. Never logs the OTP itself."""
    if purpose == EmailOTP.PASSWORD_RESET:
        expiry_minutes = int(otp_expiry().total_seconds() // 60)
        subject = "AssetFlow Password Reset OTP"
        message = f"""Hello,

Your AssetFlow password reset OTP is:

{otp}

This OTP will expire in {expiry_minutes} minute{"" if expiry_minutes == 1 else "s"}.

If you did not request a password reset, please ignore this email.

Regards,
AssetFlow Team
"""
    else:
        raise ValueError("Invalid OTP purpose")

    masked = mask_email(user_email)
    try:
        # recipient_list is always the user's own address — the Gmail
        # account above is only ever the sender (from_email), never here.
        # fail_silently=False so SMTP errors raise instead of vanishing.
        sent_count = send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user_email],
            fail_silently=False,
        )
    except Exception as exc:
        # Log the real exception type + message (e.g. SMTPAuthenticationError:
        # "535 5.7.8 Username and Password not accepted") so the actual cause
        # is visible in the Django terminal during development. smtplib/ssl
        # exception text never contains the credential itself, so this is
        # safe to log — the API response to the client stays the generic
        # 503 message regardless; this traceback is backend-only.
        logger.error(
            "AssetFlow OTP email delivery failed (purpose=%s, to=%s): %s: %s",
            purpose, masked, type(exc).__name__, exc,
            exc_info=True,
        )
        raise OTPDeliveryError from exc

    if sent_count != 1:
        logger.debug(f"[AssetFlow OTP] SMTP accepted 0 messages for {purpose} OTP to {masked}")
        logger.error("SMTP did not accept the OTP email (purpose=%s, to=%s)", purpose, masked)
        raise OTPDeliveryError("SMTP did not accept the OTP email")

    logger.debug(f"[AssetFlow OTP] Sent {purpose} OTP to {masked} (SMTP accepted {sent_count} message)")
    logger.info("AssetFlow OTP email sent (purpose=%s, to=%s)", purpose, masked)


def issue_decoy_otp(email):
    """Email a real-looking 6-digit OTP to `email`, which has no matching
    active account.

    There is no user row to attach a real EmailOTP to, so this code is
    never persisted and can never be verified — entering it on the verify
    screen will correctly fail with "Invalid or expired OTP.". It exists
    purely so the outbound email is indistinguishable from a genuine
    password-reset OTP (same subject, same body), which is what keeps
    forgot-password from leaking account existence through email content.
    Never raises; delivery failure here shouldn't affect the (always
    generic) API response.
    """
    masked = mask_email(email)
    try:
        send_otp_email(email, generate_otp(), EmailOTP.PASSWORD_RESET)
    except OTPDeliveryError:
        logger.error("forgot-password: decoy OTP delivery failed for unregistered email=%s", masked)
        return

    logger.debug(f"[AssetFlow OTP] issue_decoy_otp: sent look-alike OTP to {masked} (not stored — no matching account)")


def issue_otp(user, purpose, *, invalidate_existing=True):
    """Generate, store (hashed) and email a new OTP for `user`.

    Enforces the resend cooldown and a rolling max-requests rate limit.
    Returns (otp, sent) — sent=False when a cooldown blocked a fresh send
    (the still-valid existing OTP is returned unchanged in that case).
    Raises OTPRateLimitError if the per-window request cap is exceeded.
    """
    now = timezone.now()
    logger.debug(f"[AssetFlow OTP] issue_otp: purpose={purpose} user id={user.pk} email={mask_email(user.email)}")

    current = EmailOTP.objects.filter(user=user, purpose=purpose, used_at__isnull=True).order_by("-created_at").first()
    if current and now - current.last_sent_at < resend_cooldown():
        logger.debug(f"[AssetFlow OTP] issue_otp: cooldown active for user id={user.pk} — reusing existing OTP id={current.pk}, no email sent")
        return current, False

    window_start = now - OTP_REQUEST_WINDOW
    recent_requests = EmailOTP.objects.filter(user=user, purpose=purpose, created_at__gte=window_start).count()
    if recent_requests >= MAX_OTP_REQUESTS:
        logger.debug(f"[AssetFlow OTP] issue_otp: rate limit exceeded for user id={user.pk} ({recent_requests} requests in {OTP_REQUEST_WINDOW})")
        raise OTPRateLimitError("Too many OTP requests. Please try again later.")

    code = generate_otp()
    logger.debug(f"[AssetFlow OTP] issue_otp: generated a 6-digit OTP for user id={user.pk} (never logged in full)")

    # This is the exact recipient the email goes to — the user's own
    # registered address pulled from the DB, never a hardcoded one.
    send_otp_email(user.email.strip(), code, purpose)

    if invalidate_existing:
        EmailOTP.objects.filter(user=user, purpose=purpose, used_at__isnull=True).update(used_at=now)
    otp = EmailOTP.objects.create(
        user=user,
        purpose=purpose,
        code_hash=make_password(code),
        expires_at=now + otp_expiry(),
        last_sent_at=now,
    )
    logger.debug(f"[AssetFlow OTP] issue_otp: saved OTP id={otp.pk} for user id={user.pk}, expires_at={otp.expires_at.isoformat()}")
    return otp, True


def verify_otp(otp, code, *, consume=True):
    """Check `code` against `otp`, enforcing expiry, reuse and attempt limits."""
    logger.debug(f"[AssetFlow OTP] verify_otp: checking OTP id={otp.pk} for user id={otp.user_id} (consume={consume})")
    if otp.used_at:
        logger.debug(f"[AssetFlow OTP] verify_otp: rejected — OTP id={otp.pk} already used at {otp.used_at.isoformat()}")
        return False
    if otp.expires_at <= timezone.now():
        logger.debug(f"[AssetFlow OTP] verify_otp: rejected — OTP id={otp.pk} expired at {otp.expires_at.isoformat()}")
        return False
    if otp.attempts >= MAX_ATTEMPTS:
        logger.debug(f"[AssetFlow OTP] verify_otp: rejected — OTP id={otp.pk} exceeded {MAX_ATTEMPTS} attempts")
        return False
    if not check_password(code, otp.code_hash):
        otp.attempts += 1
        otp.save(update_fields=["attempts"])
        logger.debug(f"[AssetFlow OTP] verify_otp: rejected — wrong code for OTP id={otp.pk} (attempt {otp.attempts}/{MAX_ATTEMPTS})")
        return False
    if consume:
        otp.used_at = timezone.now()
        otp.save(update_fields=["used_at"])
        logger.debug(f"[AssetFlow OTP] verify_otp: OTP id={otp.pk} matched — marked used, cannot be reused")
    else:
        otp.verified_at = timezone.now()
        otp.save(update_fields=["verified_at"])
        logger.debug(f"[AssetFlow OTP] verify_otp: OTP id={otp.pk} matched — marked verified (still consumable once by reset-password)")
    return True


def sign_challenge(otp):
    """Sign a short-lived, tamper-proof token identifying this OTP row."""
    return signing.dumps(otp.pk, salt=f"email-otp-{otp.purpose}")


def load_challenge(token, purpose):
    """Reverse of sign_challenge(); raises if the token is invalid/expired."""
    otp_id = signing.loads(token, salt=f"email-otp-{purpose}", max_age=otp_expiry().total_seconds())
    return EmailOTP.objects.select_related("user").get(pk=otp_id, purpose=purpose)


# ── Login lockout (Settings > Security: Maximum Login Attempts / Account
# Lockout Duration) ──────────────────────────────────────────────────────
# Kept in Django's cache — the same store DRF's ScopedRateThrottle already
# uses for the login throttle — so no schema change is needed. Keyed by a
# hash of the normalized identifier whether or not an account exists, so a
# lockout never reveals account existence.

def _lockout_keys(identifier):
    digest = hashlib.sha256((identifier or "").strip().lower().encode()).hexdigest()
    return f"login-failures:{digest}", f"login-locked:{digest}"


def login_locked(identifier):
    """True while `identifier` is locked out."""
    return bool(cache.get(_lockout_keys(identifier)[1]))


def record_login_failure(identifier):
    """Count one failed login. Returns True if this failure triggered a lockout."""
    from system_settings.services import get_system_settings

    s = get_system_settings()
    window = s.account_lockout_minutes * 60
    failures_key, locked_key = _lockout_keys(identifier)
    cache.add(failures_key, 0, timeout=window)
    try:
        failures = cache.incr(failures_key)
    except ValueError:  # key expired between add() and incr()
        cache.set(failures_key, 1, timeout=window)
        failures = 1
    if failures >= s.max_login_attempts:
        cache.set(locked_key, True, timeout=window)
        cache.delete(failures_key)
        return True
    return False


def clear_login_failures(identifier):
    cache.delete(_lockout_keys(identifier)[0])
