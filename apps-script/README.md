# Apps Script JOUMPA: pemicu sinkronisasi Google Sheet

Project Apps Script **standalone** (dibuat di script.google.com, tidak dibuka dari Google Sheet). Tugasnya
hanya satu: setiap kali ada yang mengedit Sheet JOUMPA, script mengirim "ping" ke aplikasi supaya
sinkronisasi Sheet ↔ database langsung berjalan. Tanpa script ini sinkronisasi tetap berjalan otomatis
setiap 1 menit dari server; script hanya mempercepatnya.

Script **tidak** membaca atau mengubah isi Sheet dan tidak menyimpan kunci database. Ia hanya memegang
`SYNC_PING_SECRET`, rahasia yang hanya bisa memicu sinkronisasi.

## Pemasangan (sekali)

Pakai akun Google yang punya akses **edit** ke Sheet JOUMPA. Semua nilai yang perlu disalin ada di file
`.env` aplikasi, bagian "Apps Script".

1. Buka [script.google.com](https://script.google.com) → **New project**. Ganti judul "Untitled project"
   menjadi misalnya **JOUMPA Sync**.
2. Hapus isi `Code.gs` bawaan, lalu tempel isi [`Code.gs`](Code.gs) dari folder ini. Klik **Save** (ikon disket).
3. Klik ⚙️ **Project Settings** (kiri):
   - centang **Show "appsscript.json" manifest file in editor**;
   - bagian **Script Properties** → **Add script property**, tambahkan tiga properti:

   | Property           | Nilai (dari `.env`)                                          |
   |--------------------|--------------------------------------------------------------|
   | `SHEET_ID`         | baris `SHEET_ID=`                                            |
   | `SYNC_URL`         | baris `SYNC_URL=` (`https://…/api/sync/run`)                 |
   | `SYNC_PING_SECRET` | baris `SYNC_PING_SECRET=` (64 karakter, salin persis)        |

   Klik **Save script properties**.
4. Kembali ke **Editor** (ikon `< >`), buka `appsscript.json`, ganti seluruh isinya dengan
   [`appsscript.json`](appsscript.json). Save.
5. Di bilah atas editor, pilih fungsi **`cekKonfigurasi`** lalu klik **Run**. Pertama kali, Google meminta
   izin: **Review permissions** → pilih akun → jika muncul "Google hasn't verified this app", klik
   **Advanced** → **Go to JOUMPA Sync (unsafe)** → **Allow**. (Peringatan itu muncul untuk semua script
   buatan sendiri; script ini milik Anda.) Execution log harus menampilkan
   `Konfigurasi lengkap. Sheet: "Tracker Tindak Lanjut Uplifting JOUMPA" …`.
6. Pilih fungsi **`pasangTrigger`** → **Run**. Log: `Trigger terpasang.` Cek di menu kiri **Triggers** (ikon
   jam): ada dua trigger, `saatDiedit` (On edit) dan `saatStrukturBerubah` (On change).
7. Pilih fungsi **`sinkronkanSekarang`** → **Run**. Log: `Sinkronisasi selesai.` Langkah ini menjalankan
   sinkronisasi sungguhan; yang pertama kali juga menyiapkan Sheet (zona waktu Jakarta, tab
   "Temuan Mingguan", kolom ID di Penggantian SDM).

Izin yang diminta: membuka Google Sheets (dipakai hanya untuk memeriksa ID Sheet dan memasang trigger
pada Sheet itu; isi Sheet tidak dibaca), menghubungi layanan luar (mengirim ping ke aplikasi), dan
mengelola trigger.

Fungsi lain: **`hapusTrigger`** melepas kedua trigger. Sinkronisasi tetap berjalan tiap menit dari server.

## Aturan pakai Sheet

Sheet ini adalah workbook "Tracker Tindak Lanjut Uplifting JOUMPA" apa adanya. Semua rumus, Dashboard,
Rekap Performa, dan Laporan Mingguan tetap bekerja. Sinkronisasi hanya membaca dan menulis **sel isian**:

| Tab | Yang disinkronkan | Catatan |
|---|---|---|
| `Master SDM` | Stasiun, Nama, NIPP, L/P, Pre/Post-test, skor A–F, Kesimpulan, Status Penugasan, Catatan | **Nama kosong = data dihapus.** SDM baru: isi baris `TMB-xx` yang masih kosong (minimal Stasiun dan Nama). |
| `Cek BMI 2 Mingguan` | Tgl Cek, Tinggi, Berat tiap periode (Cek ke-1 s.d. ke-5); kolom AK Catatan / Program Penyesuaian BB | Isi **Tinggi dan Berat** sekaligus. Tanggal saja belum disimpan (sel diberi catatan). Kosongkan Tinggi dan Berat untuk menghapus cek itu. |
| `Log Performa Mingguan` | skor A–F, Observer / Penilai, Catatan Coaching | Baris kosong yang sudah disiapkan boleh dibiarkan. Mengosongkan semua isian di baris berarti menghapus data minggu itu. |
| `Tindak Lanjut` | Laporan s.d. PIC, Status, % Progres, Tgl Update, Realisasi / Bukti, Catatan KPS | `% Progres` diisi sebagai persen (mis. 50%). `Batas Waktu` yang berupa rumus (butir bergulir) tidak disinkronkan; yang berupa tanggal biasa disinkronkan. |
| `Penggantian SDM` | Laporan s.d. Rata-rata Praktik, Dilaporkan, Catatan, `ID SDM` (kolom Q) | Isi penggantian baru di baris bernomor yang masih kosong. Kolom P `ID Sistem` disembunyikan dan diisi sistem: jangan diubah. |
| `Parameter` | kolom C (Nilai) | Jangan ubah teks label di kolom B. C23 (hari ini) otomatis. |
| `Temuan Mingguan` | Minggu Ke, Lingkup, Temuan | Tab baru buatan sistem. Satu baris per minggu per lingkup (`SUB`, `DPS`, `CGK`, `HLP`, `KNO`, `KPS`). |

- **Kolom berisi rumus tidak pernah dibaca atau ditulis** oleh sinkronisasi. Jangan menimpa rumus.
- Tab `Petunjuk`, `Dashboard`, `Rekap Performa`, `Laporan Mingguan` tidak pernah disentuh sistem.
- **Jangan ubah judul kolom** (baris 4, atau baris 1 di Temuan Mingguan). Jika judul berubah, tab itu
  berhenti disinkronkan (tidak ada data yang diubah) sampai judulnya dikembalikan.
- **Jangan sisipkan atau hapus baris** di tab workbook: tab lain merujuk baris berdasarkan posisinya. Untuk
  menghapus data, kosongkan isiannya saja.
- **Pengaman**: jika satu kali sinkronisasi akan menghapus lebih dari 3 baris atau lebih dari 10 % isi tab,
  penghapusan dibatalkan dan admin diberi tahu.
- **Nilai tidak valid** (mis. skor 7, tinggi 300, tanggal salah, progres di atas 100%) tidak disimpan. Sel
  mendapat catatan (segitiga hitam di pojok sel); perbaiki nilainya dan catatan hilang sendiri.
- **Tanggal**: ketik `12/10/2026` (hari/bulan/tahun) atau `12 Okt 2026`. Sistem mengatur Sheet ke lokal
  Indonesia dan zona waktu Jakarta agar tanggal dan `TODAY()` benar.

## Jika data diubah di dua tempat sekaligus

Jika sel yang sama diubah di Sheet **dan** di website sebelum sempat tersinkron, **perubahan dari
website yang dipakai** (aturan `db-wins`). Nilai dari Sheet yang kalah tidak hilang: tercatat di
halaman admin (daftar konflik) beserta nilai sebelumnya, sehingga admin bisa memakainya kembali bila perlu.
Edit pada sel yang berbeda di baris yang sama tetap digabung tanpa konflik.

## Keamanan

- Project standalone hanya bisa dibuka pemiliknya (dan orang yang Anda undang ke project itu), jadi editor
  Sheet lain tidak bisa melihat `SYNC_PING_SECRET`. Rahasia ini hanya bisa memicu sinkronisasi. Jika
  bocor, ganti `SYNC_PING_SECRET` di Vercel dan di Script Properties.
- Trigger berjalan atas nama akun yang menjalankan `pasangTrigger`. Jika akun itu kehilangan akses edit
  ke Sheet, ping berhenti (sinkronisasi tiap menit tetap jalan); pasang ulang dari akun yang punya akses.
- Jangan pernah menaruh kunci Supabase atau kunci service account di script ini.

## Masalah umum

| Pesan / gejala                                       | Penyebab dan solusi |
|------------------------------------------------------|---------------------|
| "Belum dikonfigurasi"                                | Isi `SHEET_ID`, `SYNC_URL`, `SYNC_PING_SECRET` di Script Properties (langkah 3). |
| `Exception: Unexpected error while getting the method or property openById` / "not found" | `SHEET_ID` salah, atau akun ini tidak punya akses ke Sheet. Salin ulang dari `.env`; pastikan akun punya akses edit. |
| "You do not have permission to call …"               | Izin belum diberikan atau `appsscript.json` belum diganti. Ulangi langkah 4–5. |
| "Ditolak server: SYNC_PING_SECRET tidak cocok."      | Samakan nilainya dengan `SYNC_PING_SECRET` di `.env` (dan di Vercel). |
| "Sinkronisasi lain sedang berjalan"                  | Normal. Perubahan ikut di putaran berikutnya (≤ 1 menit). |
| "Sinkronisasi selesai dengan catatan"                | Ada nilai tidak valid atau judul kolom berubah. Lihat catatan sel / halaman admin. |
| Edit tidak tersinkron cepat                          | Lihat menu **Triggers**: jika kosong, jalankan `pasangTrigger` lagi. Menu **Executions** menampilkan riwayat dan error tiap ping. |
