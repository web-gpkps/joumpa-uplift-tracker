import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WeekRail } from "./WeekRail";
import { todayInJakarta, type ProgrammeSettingsRow } from "./programme-calendar";

function isComplete(row: Partial<ProgrammeSettingsRow> | null): row is ProgrammeSettingsRow {
  return Boolean(
    row &&
      row.week1_start &&
      row.weeks &&
      row.bmi_first_check &&
      row.bmi_interval_days &&
      row.bmi_periods,
  );
}

/**
 * Header context line: where the 10-week programme stands today, as the compact
 * WeekRail. Reads public.settings (id = 1) as the signed-in admin. Render inside
 * <Suspense>; it reads cookies and the clock at request time.
 */
export async function ProgrammeContext() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("settings")
    .select("week1_start, weeks, bmi_first_check, bmi_interval_days, bmi_periods")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    return (
      <p className="text-xs text-ink-muted">
        Jadwal program tidak bisa dimuat ({error.message}). Halaman lain tetap bisa dipakai.
      </p>
    );
  }
  if (!isComplete(data)) {
    return (
      <p className="text-xs text-ink-muted">
        Jadwal program belum lengkap. Isi tanggal mulai Minggu ke-1 dan jadwal cek BMI di{" "}
        <Link href="/admin/pengaturan" className="font-semibold text-brand underline underline-offset-2">
          Pengaturan
        </Link>
        .
      </p>
    );
  }

  return (
    <WeekRail
      variant="compact"
      settings={data}
      today={todayInJakarta()}
      className="lg:flex-row lg:items-center lg:justify-between lg:gap-6"
    />
  );
}
