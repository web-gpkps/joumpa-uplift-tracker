# Apps Script JOUMPA: pemicu sinkronisasi Google Sheet

Script kecil ini dipasang di Google Sheet JOUMPA. Tugasnya hanya satu: setiap kali ada yang mengedit
Sheet, script mengirim "ping" ke aplikasi supaya sinkronisasi Sheet ↔ database langsung berjalan.
Tanpa script ini sinkronisasi tetap berjalan otomatis setiap 1 menit; script hanya mempercepatnya.

Script **tidak** menyimpan kunci database. Ia hanya memegang `SYNC_PING_SECRET`, rahasia yang hanya bisa
memicu sinkronisasi dan tidak bisa membaca atau mengubah data.

## Pemasangan (sekali, oleh pemilik Sheet)

1. Buka Google Sheet JOUMPA, lalu **Extensions → Apps Script**.
2. Hapus isi `Code.gs` bawaan, lalu tempel isi file [`Code.gs`](Code.gs) dari folder ini.
3. Klik ikon roda gigi **Project Settings**, centang **Show "appsscript.json" manifest file in editor**.
   Kembali ke **Editor**, buka `appsscript.json`, ganti isinya dengan file [`appsscript.json`](appsscript.json).
4. Masih di **Project Settings**, bagian **Script Properties**, tambahkan dua properti:

   | Property           | Nilai                                                         |
   |--------------------|---------------------------------------------------------------|
   | `SYNC_URL`         | `https://<domain-aplikasi>/api/sync/run`                      |
   | `SYNC_PING_SECRET` | sama persis dengan `SYNC_PING_SECRET` di Vercel (minta ke admin) |

5. Klik **Save**. Muat ulang (refresh) tab Google Sheet. Menu **JOUMPA** muncul di bilah menu.
6. Pilih **JOUMPA → Pasang trigger**. Google meminta izin (akses Sheet ini, menghubungi layanan luar,
   mengelola trigger). Pilih akun Anda, lalu **Allow**.
7. Pilih **JOUMPA → Sinkronkan sekarang**. Muncul pesan "Sinkronisasi selesai." di pojok kanan bawah.

Jika `SYNC_URL` atau `SYNC_PING_SECRET` belum diisi, menu akan menampilkan pesan "Belum dikonfigurasi"
dan edit di Sheet tidak memicu apa pun (tidak ada error).

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

- Siapa pun yang bisa membuka editor Apps Script dapat melihat `SYNC_PING_SECRET`. Rahasia ini hanya bisa
  memicu sinkronisasi, jadi risikonya kecil. Jika bocor, admin cukup mengganti `SYNC_PING_SECRET` di
  Vercel lalu di Script Properties.
- Jangan pernah menaruh kunci Supabase atau kunci service account di script ini.

## Masalah umum

| Pesan / gejala                                  | Penyebab dan solusi |
|-------------------------------------------------|---------------------|
| "Belum dikonfigurasi"                           | Isi `SYNC_URL` dan `SYNC_PING_SECRET` di Script Properties (langkah 4). |
| "Ditolak server: SYNC_PING_SECRET tidak cocok." | Samakan nilainya dengan yang ada di Vercel. |
| "Sinkronisasi lain sedang berjalan"             | Normal. Perubahan ikut di putaran berikutnya (≤ 1 menit). |
| "Sinkronisasi selesai dengan catatan"           | Ada nilai tidak valid atau judul kolom berubah. Lihat catatan sel / halaman admin. |
| Menu JOUMPA tidak muncul                        | Muat ulang Sheet. Pastikan script tersimpan di Sheet yang benar. |
| Edit tidak tersinkron cepat                     | Jalankan lagi **JOUMPA → Pasang trigger** (oleh pemilik Sheet). Cron tetap menyinkronkan tiap menit. |
