/**
 * JOUMPA Uplifting Action Tracker: pemicu sinkronisasi Google Sheet <-> database.
 *
 * Script ini hanya mengirim "ping" ke server (POST /api/sync/run). Server yang membaca dan menulis data.
 * Tidak ada kunci database di sini. Script Properties yang dibutuhkan:
 *   SYNC_URL          https://<domain-aplikasi>/api/sync/run
 *   SYNC_PING_SECRET  rahasia khusus ping (hanya bisa memicu sinkronisasi, tidak bisa membaca data)
 */

var JEDA_PING_DETIK = 5; // edit beruntun dalam 5 detik cukup satu ping; sisanya ikut putaran cron (<= 1 menit)

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('JOUMPA')
    .addItem('Sinkronkan sekarang', 'sinkronkanSekarang')
    .addItem('Pasang trigger', 'pasangTrigger')
    .addToUi();
}

/** Menu: JOUMPA > Sinkronkan sekarang */
function sinkronkanSekarang() {
  var hasil = kirimPing_('menu', false);
  SpreadsheetApp.getActive().toast(hasil.pesan, 'JOUMPA', 10);
}

/** Menu: JOUMPA > Pasang trigger (sekali saja, oleh pemilik Sheet). */
function pasangTrigger() {
  var ui = SpreadsheetApp.getUi();
  if (!konfigurasi_()) {
    ui.alert('JOUMPA', pesanBelumDikonfigurasi_(), ui.ButtonSet.OK);
    return;
  }
  var ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'saatDiedit' || f === 'saatStrukturBerubah') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('saatDiedit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('saatStrukturBerubah').forSpreadsheet(ss).onChange().create();
  ui.alert('JOUMPA', 'Trigger terpasang. Setiap perubahan di Sheet akan memicu sinkronisasi.', ui.ButtonSet.OK);
}

/** Trigger terpasang: setiap edit sel. */
function saatDiedit(e) {
  kirimPing_('edit', true);
}

/** Trigger terpasang: hapus/sisip baris atau tab (tidak memicu onEdit). */
function saatStrukturBerubah(e) {
  var jenis = e && e.changeType;
  if (jenis === 'EDIT' || jenis === 'FORMAT') return; // sudah ditangani saatDiedit / tidak relevan
  kirimPing_('change', true);
}

function kirimPing_(sumber, pakaiJeda) {
  var cfg = konfigurasi_();
  if (!cfg) return { ok: false, pesan: pesanBelumDikonfigurasi_() };

  if (pakaiJeda) {
    var cache = CacheService.getDocumentCache();
    if (cache.get('joumpa_ping')) return { ok: true, pesan: 'Dilewati (jeda).' };
    cache.put('joumpa_ping', '1', JEDA_PING_DETIK);
  }

  try {
    var res = UrlFetchApp.fetch(cfg.url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ source: 'sheet:' + sumber }),
      headers: { Authorization: 'Bearer ' + cfg.secret },
      muteHttpExceptions: true,
      followRedirects: false,
    });
    var kode = res.getResponseCode();
    var isi = {};
    try {
      isi = JSON.parse(res.getContentText());
    } catch (err) {}

    if (kode === 200 && isi.status === 'busy') {
      return { ok: true, pesan: 'Sinkronisasi lain sedang berjalan. Perubahan Anda ikut pada putaran berikutnya (paling lama 1 menit).' };
    }
    if (kode === 200 && isi.status === 'partial') {
      return { ok: true, pesan: 'Sinkronisasi selesai dengan catatan. Lihat catatan sel (segitiga hitam) atau halaman admin.' };
    }
    if (kode === 200) return { ok: true, pesan: 'Sinkronisasi selesai.' };
    if (kode === 401) return { ok: false, pesan: 'Ditolak server: SYNC_PING_SECRET tidak cocok.' };
    if (kode === 503) return { ok: false, pesan: 'Server belum dikonfigurasi untuk sinkronisasi.' };
    return { ok: false, pesan: 'Sinkronisasi gagal (kode ' + kode + '). Coba lagi nanti atau hubungi admin.' };
  } catch (err) {
    console.warn('JOUMPA ping gagal: ' + err.message);
    return { ok: false, pesan: 'Tidak dapat menghubungi server. Coba lagi nanti.' };
  }
}

function konfigurasi_() {
  var p = PropertiesService.getScriptProperties();
  var url = (p.getProperty('SYNC_URL') || '').trim();
  var secret = (p.getProperty('SYNC_PING_SECRET') || '').trim();
  if (!/^https:\/\/\S+$/.test(url) || secret.length < 16) return null;
  return { url: url, secret: secret };
}

function pesanBelumDikonfigurasi_() {
  return 'Belum dikonfigurasi. Buka Extensions > Apps Script > Project Settings > Script Properties, ' +
    'lalu isi SYNC_URL dan SYNC_PING_SECRET.';
}
