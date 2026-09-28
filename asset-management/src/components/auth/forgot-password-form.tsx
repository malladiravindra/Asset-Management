"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ApiError, apiPost } from "@/lib/api";

type Step = "email" | "otp" | "reset" | "success";

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const visible = user.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(user.length - 2, 3))}@${domain}`;
}

export function ForgotPasswordForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (step !== "otp" || resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [step, resendIn]);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      await apiPost("/accounts/forgot-password/", { email });
      setResendIn(RESEND_SECONDS);
      setStep("otp");
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to reach the server.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOtpChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(OTP_LENGTH).fill("");
    pasted.split("").forEach((d, i) => (next[i] = d));
    setOtp(next);
    otpRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const code = otp.join("");

    if (code.length < OTP_LENGTH) {
      setError("Enter the complete 6-digit code.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiPost<{ reset_token: string }>("/accounts/verify-forgot-password-otp/", { email, otp: code });
      setResetToken(response.reset_token);
      setStep("reset");
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to reach the server.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    if (resendIn > 0) return;
    setOtp(Array(OTP_LENGTH).fill(""));
    setIsSubmitting(true);
    try {
      await apiPost("/accounts/resend-otp/", { email });
      setResendIn(RESEND_SECONDS);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to reach the server.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await apiPost("/accounts/reset-password/", { email, reset_token: resetToken, new_password: password, confirm_password: confirmPassword });
      setStep("success");
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to reach the server.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl shadow-slate-900/5 ring-1 ring-slate-900/5 sm:p-10">
      {step !== "success" && (
        <div className="mb-6 flex items-center gap-3">
          {["email", "otp", "reset"].map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-3">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition",
                  step === s
                    ? "bg-blue-600 text-white"
                    : ["email", "otp", "reset"].indexOf(step) > i
                      ? "bg-blue-100 text-blue-600"
                      : "bg-slate-100 text-slate-400"
                )}
              >
                {["email", "otp", "reset"].indexOf(step) > i ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  i + 1
                )}
              </span>
              {i < 2 && (
                <span
                  className={cn(
                    "h-0.5 flex-1 rounded-full transition",
                    ["email", "otp", "reset"].indexOf(step) > i ? "bg-blue-200" : "bg-slate-100"
                  )}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {step === "email" && (
        <>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-900">Forgot password?</h1>
            <p className="mt-2 text-sm text-slate-500">
              Enter your registered email and we&apos;ll send you a one-time code.
            </p>
          </div>

          <form onSubmit={handleSendCode} className="mt-8 space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="admin@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? "Sending code…" : "Send Code"}
            </button>
          </form>
        </>
      )}

      {step === "otp" && (
        <>
          <div className="text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
              <KeyRound className="h-5 w-5 text-blue-600" />
            </span>
            <h1 className="mt-4 text-2xl font-bold text-slate-900">Enter verification code</h1>
            <p className="mt-2 text-sm text-slate-500">
              We sent a 6-digit code to <span className="font-medium text-slate-700">{maskEmail(email)}</span>
            </p>
          </div>

          <form onSubmit={handleVerifyOtp} className="mt-8 space-y-5">
            <div className="flex justify-between gap-2">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    otpRefs.current[i] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  onPaste={handleOtpPaste}
                  className="h-12 w-11 rounded-lg border border-slate-200 text-center text-lg font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              ))}
            </div>

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? "Verifying…" : "Verify Code"}
            </button>

            <p className="text-center text-sm text-slate-500">
              Didn&apos;t get the code?{" "}
              {resendIn > 0 ? (
                <span className="font-medium text-slate-400">Resend in {resendIn}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  className="font-semibold text-blue-600 hover:text-blue-700"
                >
                  Resend code
                </button>
              )}
            </p>
          </form>
        </>
      )}

      {step === "reset" && (
        <>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-900">Set a new password</h1>
            <p className="mt-2 text-sm text-slate-500">
              Choose a strong password you haven&apos;t used before.
            </p>
          </div>

          <form onSubmit={handleResetPassword} className="mt-8 space-y-5">
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
                New password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">Must be at least 8 characters.</p>
            </div>

            <div>
              <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-slate-700">
                Confirm password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
                <input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? "Resetting…" : "Reset Password"}
            </button>
          </form>
        </>
      )}

      {step === "success" && (
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 className="h-7 w-7 text-emerald-600" />
          </span>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Password reset</h1>
          <p className="mt-2 text-sm text-slate-500">
            Your password has been updated. You can now sign in with your new password.
          </p>
          <Link
            href="/"
            className="mt-8 flex w-full items-center justify-center rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            Back to Sign In
          </Link>
        </div>
      )}

      {step !== "success" && (
        <Link
          href="/"
          className="mt-6 flex items-center justify-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Sign In
        </Link>
      )}
    </div>
  );
}
