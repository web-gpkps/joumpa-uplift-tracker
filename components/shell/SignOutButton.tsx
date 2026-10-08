import { signOut } from "@/app/auth/actions";
import type { ButtonVariant } from "@/components/ui/Button";
import { SubmitButton } from "@/components/ui/SubmitButton";

type SignOutButtonProps = {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  children?: React.ReactNode;
};

/** A one-button form posting to the signOut server action. Works before hydration. */
export function SignOutButton({ variant = "quiet", fullWidth, children = "Keluar" }: SignOutButtonProps) {
  return (
    <form action={signOut} className={fullWidth ? "w-full" : undefined}>
      <SubmitButton variant={variant} fullWidth={fullWidth} pendingText="Keluar…">
        {children}
      </SubmitButton>
    </form>
  );
}
