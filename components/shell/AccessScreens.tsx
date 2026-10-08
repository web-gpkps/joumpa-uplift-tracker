import { APP_NAME } from "@/lib/app-info";
import { ReloadButton } from "@/components/ui/ReloadButton";
import { AuthFrame } from "./AuthFrame";
import { SignOutButton } from "./SignOutButton";

/** Signed in, but the account is not in public.admins. */
export function NotAdminScreen({ email }: { email: string }) {
  return (
    <AuthFrame
      title="Akun ini belum terdaftar sebagai admin"
      intro={
        <>
          <p>
            Anda masuk sebagai <span className="font-semibold text-ink">{email || "akun tanpa email"}</span>.
            Akun ini belum ada di daftar admin {APP_NAME}, jadi area pemilik tidak dibuka.
          </p>
          <p className="mt-2">
            Stasiun dan KPS tidak perlu akun: mereka memakai tautan ruang kerja. Jika akun ini
            memang harus menjadi admin, minta pemilik aplikasi menambahkannya, lalu masuk lagi.
          </p>
        </>
      }
    >
      <SignOutButton variant="primary" fullWidth>
        Keluar
      </SignOutButton>
    </AuthFrame>
  );
}

const UNAVAILABLE_COPY = {
  config: {
    title: "Aplikasi belum terhubung ke database",
    body: "Alamat dan kunci Supabase belum diisi (NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY). Isi keduanya di pengaturan lingkungan, lalu muat ulang halaman.",
  },
  auth: {
    title: "Server login tidak bisa dihubungi",
    body: "Sesi Anda belum bisa diperiksa karena layanan login Supabase tidak menjawab. Periksa koneksi, lalu muat ulang halaman.",
  },
  database: {
    title: "Daftar admin tidak bisa dibaca",
    body: "Database menolak atau tidak menjawab saat akses admin diperiksa. Muat ulang halaman; jika masih gagal, hubungi pengelola aplikasi.",
  },
} as const;

/** The admin check could not run: missing configuration, Auth or database unreachable. */
export function GateUnavailableScreen({
  reason,
  detail,
}: {
  reason: keyof typeof UNAVAILABLE_COPY;
  detail?: string;
}) {
  const copy = UNAVAILABLE_COPY[reason];
  return (
    <AuthFrame
      title={copy.title}
      intro={
        <>
          <p>{copy.body}</p>
          {detail ? <p className="mt-2 text-xs">Pesan teknis: {detail}</p> : null}
        </>
      }
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <ReloadButton variant="primary" />
      </div>
    </AuthFrame>
  );
}

/** /s/<token> with an unknown, malformed or revoked token. Stations have no login to fall back to. */
export function InvalidLinkScreen() {
  return (
    <AuthFrame
      title="Tautan tidak berlaku atau sudah dicabut"
      intro={
        <>
          <p>
            Tautan ruang kerja ini tidak dikenali. Mungkin tautannya terpotong saat disalin, sudah
            dicabut, atau sudah diganti dengan tautan baru.
          </p>
          <p className="mt-2">
            Periksa lagi tautan yang Anda terima. Jika tetap tidak bisa dibuka, minta tautan baru
            kepada pemilik aplikasi.
          </p>
        </>
      }
    />
  );
}

/** share_open failed for another reason (database unreachable, unexpected answer). */
export function WorkspaceUnavailableScreen({ detail }: { detail?: string }) {
  return (
    <AuthFrame
      title="Ruang kerja belum bisa dibuka"
      intro={
        <>
          <p>
            Data untuk tautan ini tidak bisa diambil dari database saat ini. Tautannya sendiri tidak
            perlu diganti.
          </p>
          {detail ? <p className="mt-2 text-xs">Pesan teknis: {detail}</p> : null}
        </>
      }
    >
      <ReloadButton variant="primary" />
    </AuthFrame>
  );
}
