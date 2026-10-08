"use client";

import { useActionState, useSyncExternalStore } from "react";
import { catchError, type ErrorInfo } from "next/error";
import { signIn, type SignInState } from "@/app/auth/actions";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

const initialState: SignInState = { status: "idle" };

const subscribeToNothing = () => () => {};
const readNextParam = () => new URLSearchParams(window.location.search).get("next") ?? "/admin";

/**
 * An action that never reaches the server rejects, and useActionState rethrows it during
 * render; this boundary shows it. The success redirect passes through catchError untouched.
 */
const NetworkErrorBoundary = catchError(function LoginNetworkError(
  _props: object,
  { reset }: ErrorInfo,
) {
  return (
    <div className="flex flex-col gap-4">
      <p
        role="alert"
        className="rounded-control bg-critical-tint px-3 py-2.5 text-sm font-medium text-critical"
      >
        Tidak bisa terhubung ke server. Periksa koneksi internet perangkat ini, lalu coba lagi.
      </p>
      <Button fullWidth onClick={() => reset()}>
        Coba lagi
      </Button>
    </div>
  );
});

export function LoginForm() {
  return (
    <NetworkErrorBoundary>
      <LoginFormFields />
    </NetworkErrorBoundary>
  );
}

/**
 * Email + password sign-in. The server action is passed straight to useActionState,
 * so the form also works before JavaScript has loaded (progressive enhancement).
 */
function LoginFormFields() {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  // ?next= from the proxy redirect, read without useSearchParams (no Suspense on this
  // prerendered page). The server action accepts only /admin paths.
  const next = useSyncExternalStore(subscribeToNothing, readNextParam, () => "/admin");

  const error = state.status === "error" ? state : null;
  const fieldErrors = error?.fields;

  return (
    <form action={formAction} noValidate className="flex flex-col">
      <input type="hidden" name="next" value={next} />

      {/* Always mounted so screen readers announce the message when it appears. */}
      <div role="alert" aria-live="assertive" className="not-empty:mb-5">
        {error ? (
          <p className="rounded-control bg-critical-tint px-3 py-2.5 text-sm font-medium text-critical">
            {error.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-5">
        <Field label="Email" error={fieldErrors?.email}>
          <Input
            name="email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={error?.email ?? ""}
          />
        </Field>

        <Field label="Kata sandi" error={fieldErrors?.password}>
          <Input name="password" type="password" autoComplete="current-password" />
        </Field>

        <Button type="submit" fullWidth loading={pending} loadingText="Memeriksa akun…">
          Masuk
        </Button>
      </div>
    </form>
  );
}
