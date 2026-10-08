# JOUMPA Uplifting Action Tracker

**Monitoring Hasil Evaluasi & Tindak Lanjut Perbaikan Layanan**

Aplikasi web untuk memantau tindak lanjut pelatihan Uplifting Service JOUMPA, Customer Service
Division PT Gapura Angkasa: 75 petugas di stasiun SUB, DPS, CGK, HLP dan KNO selama 10 minggu
(12 Okt s.d. 14 Des 2026). Isinya mengikuti workbook "Tracker Tindak Lanjut Uplifting JOUMPA",
sheet demi sheet.

## Siapa memakai apa

| Peran | Akses | Cakupan |
|---|---|---|
| Stasiun (SUB, DPS, CGK, HLP, KNO) | tautan ruang kerja `/s/<token>`, tanpa akun | data stasiun sendiri |
| KPS | tautan ruang kerja dengan lingkup KPS, tanpa akun | semua stasiun |
| Pemilik | masuk di `/login`, area `/admin` | semua stasiun, termasuk tautan, Parameter dan sinkronisasi |

Sheet yang tersedia: Dashboard, Master SDM, Log Performa, Cek BMI, Tindak Lanjut, Penggantian SDM
dan Laporan Mingguan (bisa dicetak A4). Di desktop pengisian memakai tabel ala spreadsheet
(navigasi keyboard, tempel dari Excel, simpan otomatis per baris); di ponsel memakai kartu.

Google Sheet replika tersinkron dua arah dengan database. Bila sel yang sama diubah di kedua sisi,
perubahan dari aplikasi yang dipakai dan nilai dari Sheet dicatat di log konflik.

## Teknologi

Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS 4, Supabase
(Postgres, Auth, RLS), Vercel, Google Sheets API dan Apps Script. Paket dikelola dengan bun.

## Menjalankan secara lokal

```bash
bun install
cp .env.example .env.local   # lalu isi nilainya, lihat tabel di bawah
bun run dev
```

| Variabel | Untuk |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | koneksi aplikasi ke Supabase (publik) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | mesin sinkronisasi, hanya di server |
| `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHEETS_ID` | akses service account ke Google Sheet |
| `SYNC_SECRET`, `SYNC_PING_SECRET` | otorisasi `POST /api/sync/run` (cron dan Apps Script) |
| `CONFLICT_POLICY` | opsional, bawaan `db-wins` |

Jangan pernah menaruh kunci service role atau kunci Google di variabel `NEXT_PUBLIC_*`.

## Database

Skema, RLS dan fungsi `share_*` ada di `supabase/migrations/`. Tes keamanan pgTAP di `tests/sql/`
membuktikan pemisahan antarstasiun, penolakan tautan yang dicabut, dan akses pemilik.

```bash
supabase db push --db-url "$SUPABASE_DB_URL"
supabase test db --db-url "$SUPABASE_DB_URL" tests/sql
```

Langkah produksi sekali jalan (pg_cron, Vault) ada di `supabase/production-setup.sql`.

## Tes

```bash
bun test lib components   # rumus workbook, agregasi, grid, sinkronisasi
bun run lint
bun run build
```

## Dokumen

- `docs/SPEC.md`: model akses, model data, aturan dari workbook
- `docs/UX.md` dan `DESIGN.md`: perilaku layar dan arah visual
- `docs/SYNC.md` dan `apps-script/README.md`: sinkronisasi Google Sheet

Workbook sumber dan data seed berisi nama petugas, jadi tidak disimpan di repositori ini.
