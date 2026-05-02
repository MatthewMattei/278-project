"use client";

import { createClient } from "@/lib/supabase/client";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Tab = "signin" | "signup";
type SignUpStep = 1 | 2 | 3;

const AuthBackgroundMap = dynamic(() => import("../../components/AuthBackgroundMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-zinc-900/30" />,
});

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const err = searchParams.get("error");
  const nextPath = searchParams.get("next") ?? "/map";
  const safeNext = nextPath.startsWith("/") ? nextPath : "/map";

  const [tab, setTab] = useState<Tab>("signin");
  const [signUpStep, setSignUpStep] = useState<SignUpStep>(1);
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [guidelinesAccepted, setGuidelinesAccepted] = useState(false);
  const [guidelinesScrolledToEnd, setGuidelinesScrolledToEnd] = useState(false);
  const guidelinesRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"ok" | "err">("ok");
  const progressWidth = `${(signUpStep / 3) * 100}%`;

  function setMsg(text: string | null, tone: "ok" | "err") {
    setMessage(text);
    setMessageTone(tone);
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null, "ok");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: signInEmail,
      password: signInPassword,
    });
    setBusy(false);
    if (error) {
      setMsg(error.message, "err");
      return;
    }
    router.replace(safeNext);
    router.refresh();
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (!guidelinesScrolledToEnd || !guidelinesAccepted) {
      setMsg(
        "Scroll through the guidelines and confirm agreement before creating your account.",
        "err",
      );
      return;
    }
    setBusy(true);
    setMsg(null, "ok");
    const supabase = createClient();
    const origin = window.location.origin;
    const trimmedName = displayName.trim();
    const { error } = await supabase.auth.signUp({
      email: signUpEmail,
      password: signUpPassword,
      options: {
        data: {
          full_name: trimmedName.length > 0 ? trimmedName : null,
        },
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
      },
    });
    setBusy(false);
    if (error) {
      setMsg(error.message, "err");
      return;
    }
    setMsg(
      "Check your email to confirm your account (if confirmation is enabled), then sign in.",
      "ok",
    );
  }

  function handleGuidelinesScroll() {
    const el = guidelinesRef.current;
    if (!el || guidelinesScrolledToEnd) return;
    const scrollProgress = el.scrollTop + el.clientHeight;
    if (scrollProgress >= el.scrollHeight - 12) {
      setGuidelinesScrolledToEnd(true);
    }
  }

  function goToSignUpStep2(e: React.FormEvent) {
    e.preventDefault();
    if (!signUpEmail.trim()) {
      setMsg("Enter your email to continue.", "err");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(signUpEmail.trim())) {
      setMsg("Enter a valid email address.", "err");
      return;
    }
    if (signUpPassword.length < 6) {
      setMsg("Use a password with at least 6 characters.", "err");
      return;
    }
    setMsg(null, "ok");
    setSignUpStep(2);
  }

  function goToSignUpStep3(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) {
      setMsg("Enter a display name to continue.", "err");
      return;
    }
    setMsg(null, "ok");
    setGuidelinesAccepted(false);
    setGuidelinesScrolledToEnd(false);
    setSignUpStep(3);
  }

  useEffect(() => {
    if (tab !== "signup" || signUpStep !== 3 || !guidelinesRef.current) return;
    guidelinesRef.current.scrollTop = 0;
  }, [tab, signUpStep]);

  return (
    <div className="relative flex min-h-screen items-start justify-center overflow-hidden px-3 py-4 sm:items-center sm:px-4 sm:py-8">
      <div className="absolute inset-0">
        <AuthBackgroundMap />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-zinc-950/38" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-zinc-950/45 via-zinc-900/22 to-zinc-950/58" />

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/35 bg-white/92 p-5 shadow-[0_24px_64px_rgba(15,23,42,0.35)] backdrop-blur-md dark:border-zinc-600 dark:bg-zinc-900/82 sm:p-8">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700/95 dark:text-emerald-300">
            PinTogether
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {tab === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Explore places, plan events, and share trusted reviews with friends.
          </p>
        </div>

        {err === "auth" ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            Something went wrong signing you in. Try again.
          </p>
        ) : null}

        <div className="mt-5 flex min-h-[500px] flex-col sm:mt-6 sm:min-h-[540px]">
          <div className="flex rounded-xl border border-zinc-200/90 bg-white/50 p-0.5 dark:border-zinc-700 dark:bg-zinc-900/40">
            <button
              type="button"
              onClick={() => {
                setTab("signin");
                setMsg(null, "ok");
              }}
                className={`flex-1 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                tab === "signin"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("signup");
                setSignUpStep(1);
                setMsg(null, "ok");
              }}
                className={`flex-1 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                tab === "signup"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              Create account
            </button>
          </div>

          <div className="mt-5 flex-1 sm:mt-6">
            {tab === "signin" ? (
              <form onSubmit={(e) => void signIn(e)} className="space-y-4" noValidate>
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={signInEmail}
                    onChange={(e) => setSignInEmail(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 outline-none ring-emerald-500 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={signInPassword}
                    onChange={(e) => setSignInPassword(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 outline-none ring-emerald-500 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                      className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {busy ? "Signing in…" : "Sign in"}
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
                    <span>Step {signUpStep} of 3</span>
                    <span>
                      {signUpStep === 1
                        ? "Credentials"
                        : signUpStep === 2
                          ? "Profile"
                          : "Guidelines"}
                    </span>
                  </div>
                    <div className="h-1.5 w-full rounded-full bg-zinc-200/90 dark:bg-zinc-700">
                    <div
                        className="h-full rounded-full bg-emerald-600 transition-all duration-500 ease-out"
                      style={{ width: progressWidth }}
                    />
                  </div>
                </div>
                {signUpStep === 1 ? (
                  <form onSubmit={goToSignUpStep2} className="space-y-4" noValidate>
                    <div>
                      <label
                        htmlFor="signup_email"
                        className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                      >
                        Email
                      </label>
                      <input
                        id="signup_email"
                        name="email"
                        type="email"
                        required
                        autoComplete="email"
                        value={signUpEmail}
                        onChange={(e) => setSignUpEmail(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 outline-none ring-emerald-500 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                      />
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Use an email you can access for account confirmation.
                      </p>
                    </div>
                    <div>
                      <label
                        htmlFor="signup_password"
                        className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                      >
                        Password
                      </label>
                      <input
                        id="signup_password"
                        name="password"
                        type="password"
                        required
                        autoComplete="new-password"
                        minLength={6}
                        value={signUpPassword}
                        onChange={(e) => setSignUpPassword(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 outline-none ring-emerald-500 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                      />
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Minimum 6 characters.
                      </p>
                    </div>
                    <button
                      type="submit"
                      className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      Continue
                    </button>
                  </form>
                ) : null}

                {signUpStep === 2 ? (
                  <form onSubmit={goToSignUpStep3} className="space-y-4" noValidate>
                    <div>
                      <label
                        htmlFor="display_name"
                        className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                      >
                        Display name
                      </label>
                      <input
                        id="display_name"
                        name="display_name"
                        type="text"
                        required
                        autoComplete="nickname"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="How others see you"
                        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 outline-none ring-emerald-500 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                      />
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        This is how your reviews appear to others.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSignUpStep(1);
                          setMsg(null, "ok");
                        }}
                        className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700"
                      >
                        Continue
                      </button>
                    </div>
                  </form>
                ) : null}

                {signUpStep === 3 ? (
                  <form onSubmit={(e) => void signUp(e)} className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                        Review community guidelines
                      </p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Scroll to the end, then confirm agreement to finish account creation.
                      </p>
                    </div>
                    <div
                      ref={guidelinesRef}
                      onScroll={handleGuidelinesScroll}
                      className="h-48 overflow-y-auto rounded-lg border border-zinc-300 bg-zinc-50 p-3 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 sm:h-52"
                    >
                      <p className="font-semibold">Respect businesses and people</p>
                      <p className="mt-1">
                        Write about your experience, not personal attacks. Do not coordinate harassment,
                        brigading, or dishonest reviews. Misleading or abusive content can lead to suspension
                        or a permanent ban.
                      </p>
                      <p className="mt-4 font-semibold">Be specific and fair</p>
                      <p className="mt-1">
                        Mention what you ordered, timing, and price range when possible. Group reviews work
                        best when everyone submits their own perspective before the window closes.
                      </p>
                      <p className="mt-4 font-semibold">Events and coordination</p>
                      <p className="mt-1">
                        Include clear meeting details, start times, and expectations so plans remain easy to
                        follow.
                      </p>
                      <p className="mt-4 font-semibold">Enforcement</p>
                      <p className="mt-1">
                        We may remove content or restrict accounts that break these guidelines. Serious or
                        repeated violations can result in suspension or a ban.
                      </p>
                    </div>
                    <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                      <input
                        type="checkbox"
                        checked={guidelinesAccepted}
                        onChange={(e) => setGuidelinesAccepted(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-600"
                      />
                      <span>
                        I have read and agree to follow the community guidelines.
                      </span>
                    </label>
                    {!guidelinesScrolledToEnd ? (
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        Scroll to the bottom of the guidelines to continue.
                      </p>
                    ) : (
                      <p className="text-xs text-emerald-700 dark:text-emerald-400">
                        Great - you reached the end.
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSignUpStep(2);
                          setMsg(null, "ok");
                        }}
                        className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        disabled={busy || !guidelinesAccepted || !guidelinesScrolledToEnd}
                        className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {busy ? "Creating…" : "Create account"}
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {message ? (
          <p
            className={
              messageTone === "err"
                ? "text-sm text-red-600 dark:text-red-400"
                : "text-sm text-emerald-700 dark:text-emerald-400"
            }
          >
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
