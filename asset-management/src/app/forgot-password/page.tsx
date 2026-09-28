import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { HeroIllustration } from "@/components/brand/hero-illustration";
import { Logo } from "@/components/brand/logo";

export default function ForgotPasswordPage() {
  return (
    <div className="grid min-h-screen flex-1 grid-cols-1 lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-10 lg:flex xl:p-14">
        <Logo dark />

        <div className="absolute inset-0">
          <HeroIllustration />
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="text-4xl font-bold leading-tight text-white xl:text-5xl">
            Account Recovery
          </h2>
          <p className="mt-5 text-base leading-relaxed text-slate-300">
            Verify your identity with a one-time code sent to your registered
            email, then choose a new password to get back into AssetFlow.
          </p>
        </div>

        <p className="relative z-10 text-sm text-slate-500">
          © 2026 AssetFlow Technologies. All rights reserved.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center bg-slate-50 p-6 sm:p-10">
        <div className="mb-8 lg:hidden">
          <Logo />
        </div>
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
