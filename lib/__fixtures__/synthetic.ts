/**
 * Synthetic tracker data (no real people) that exercises every aggregation path the real
 * workbook leaves empty: weekly scores with gaps and partial rows, BMI boundaries, rolling
 * due dates, every action flag and replacement state. Expected values are worked out by
 * hand in lib/aggregate.test.ts. "Today" for this fixture is Monday 2 Nov 2026 (week 4,
 * two days after the replacement deadline).
 */

import { DEFAULT_SETTINGS, type ScoreFields, type Settings } from '../rules';
import type { TrackerData } from '../aggregate';

export const SYNTHETIC_TODAY = '2026-11-02';

export const SYNTHETIC_SETTINGS: Settings = { ...DEFAULT_SETTINGS, minHeightFemale: 155, minHeightMale: 165 };

const sc = (...s: Array<number | null>): ScoreFields => ({
  scoreA: s[0] ?? null,
  scoreB: s[1] ?? null,
  scoreC: s[2] ?? null,
  scoreD: s[3] ?? null,
  scoreE: s[4] ?? null,
  scoreF: s[5] ?? null,
});

const staff = (
  code: string,
  station: string,
  name: string,
  gender: string | null,
  postTest: number | null,
  reportConclusion: string | null,
  scores: ScoreFields,
) => ({ code, station, name, gender, postTest, reportConclusion, ...scores });

export const SYNTHETIC: TrackerData = {
  settings: SYNTHETIC_SETTINGS,
  staff: [
    //     code      stn    name         L/P   post  report conclusion          baseline A–F       avg   criteria
    staff('SUB-01', 'SUB', 'Petugas A', 'P', null, 'Sesuai', sc(4, 4, 4, 4, 4, 4)), // 4.00 Sesuai (no post-test)
    staff('SUB-02', 'SUB', 'Petugas B', 'L', 76, 'Sesuai dengan Catatan', sc(4, 4, 4, 4, 4, 4)), // 4.00 Perlu (post < 80) → Beda
    staff('DPS-01', 'DPS', 'Petugas C', 'P', 90, 'Tidak Sesuai', sc(3, 3, 3, 3, 3, 2)), // 2.83 Tidak
    staff('DPS-02', 'DPS', 'Petugas D', null, 80, null, sc(3, 3, 3, 3, 3, 3)), // 3.00 Perlu
    staff('CGK-01', 'CGK', 'Petugas E', 'L', 88, 'Sesuai', sc(4, 4, 4, 4, 4, null)), // 4.00 Sesuai (5 scores)
    staff('HLP-01', 'HLP', 'Petugas F', 'P', 95, 'Perlu Perbaikan', sc()), // no scores
    staff('KNO-01', 'KNO', 'Petugas G', 'L', 85, 'Tidak Sesuai', sc(4, 3, 4, 3, 4, 3)), // 3.50 Perlu → Beda
    staff('KNO-02', 'KNO', 'Petugas H', 'P', 100, 'Sesuai', sc(5, 5, 4, 4, 4, 4)), // 4.33 Sesuai
  ],
  weeklyScores: [
    { staffCode: 'SUB-01', week: 1, ...sc(3, 3, 3, 3, 3, 3) }, // 3.00
    { staffCode: 'SUB-01', week: 2, ...sc(4, 4, 4, 4, 4, 4) }, // 4.00
    { staffCode: 'SUB-01', week: 4, ...sc(5, 4, 4, 4, 4, 4) }, // 4.17
    { staffCode: 'SUB-02', week: 1, ...sc(4, 4, 4, 4, 4, 4) }, // 4.00
    { staffCode: 'SUB-02', week: 2, ...sc(3, 4, 3, 4, 3, 4) }, // 3.50
    { staffCode: 'DPS-01', week: 2, ...sc(3, 3, 3, 3, 3, 3) }, // 3.00
    { staffCode: 'DPS-01', week: 10, ...sc(4, 4, 4, 4, 4, 4) }, // 4.00 (gap: latest = week 10)
    { staffCode: 'DPS-02', week: 1, ...sc(2, 2, 2, 2, 2, 3) }, // 2.17
    { staffCode: 'CGK-01', week: 1, ...sc(4, 4, 4, null, null, null) }, // 4.00 (partial row)
    { staffCode: 'HLP-01', week: 1, ...sc() }, // row without scores
    { staffCode: 'KNO-01', week: 1, ...sc(3, 3, 3, 3, 4, 4) }, // 3.33
    { staffCode: 'KNO-01', week: 2, ...sc(3, 3, 4, 4, 4, 4) }, // 3.67
  ],
  bmiChecks: [
    { staffCode: 'SUB-01', period: 1, heightCm: 160, weightKg: 66 }, // 25.8 Overweight
    { staffCode: 'SUB-01', period: 2, heightCm: 160, weightKg: 64 }, // 25.0 Normal (boundary)
    { staffCode: 'SUB-02', period: 1, heightCm: 200, weightKg: 73.8 }, // 18.45 → 18.5 Normal (ROUND half away)
    { staffCode: 'DPS-01', period: 1, heightCm: 150, weightKg: 41 }, // 18.2 Kurus; 150 < 155
    { staffCode: 'DPS-02', period: 1, heightCm: 170, weightKg: 78 }, // 27.0 Overweight (boundary)
    { staffCode: 'DPS-02', period: 2, heightCm: 170, weightKg: 78.1 }, // 27.02 → 27.0 Overweight
    { staffCode: 'DPS-02', period: 3, heightCm: 170, weightKg: 79 }, // 27.3 Obesitas
    { staffCode: 'CGK-01', period: 2, heightCm: 160, weightKg: 77 }, // 30.1 Obesitas; 160 < 165
    { staffCode: 'KNO-01', period: 1, heightCm: 175, weightKg: 70 }, // 22.9 Normal
    { staffCode: 'KNO-01', period: 2, heightCm: 175, weightKg: 68.5 }, // 22.4 Normal
  ],
  actionItems: [
    { code: 'SUB-TL01', reportGroup: 'SUB', kind: 'Sekali', dueDate: '2026-10-30', status: 'Belum Mulai', progress: 0 }, // OVERDUE
    { code: 'SUB-TL02', reportGroup: 'SUB', kind: 'Sekali', dueDate: '2026-11-02', status: 'On Progress', progress: 50 }, // due today
    { code: 'SUB-TL03', reportGroup: 'SUB', kind: 'Rutin', dueDate: '2026-11-09', status: 'Belum Mulai', progress: 0 }, // 7 days
    { code: 'DPS-TL01', reportGroup: 'DPS', kind: 'Rutin', dueDate: '2026-11-10', status: 'On Progress', progress: 25 }, // Rutin – pantau
    { code: 'DPS-TL02', reportGroup: 'DPS', kind: 'Sekali', dueDate: '2026-10-01', status: 'Selesai', progress: 100 }, // Selesai
    { code: 'CGKHLP-TL01', reportGroup: 'CGK & HLP', kind: 'Sekali', dueDate: null, status: 'Tertunda', progress: 10 }, // no flag
    { code: 'CGKHLP-TL02', reportGroup: 'CGK & HLP', kind: 'Sekali', dueDate: '2026-12-31', status: 'Belum Mulai', progress: 0 }, // On Track
    {
      code: 'KNO-TL10',
      reportGroup: 'KNO',
      kind: 'Rutin',
      schedule: 'Tanggal 5 setiap bulan (batas = jatuh tempo berikutnya)',
      dueDate: '2026-11-05',
      status: 'Belum Mulai',
      progress: 0,
    }, // rolling → 5 Nov, 3 days
    {
      code: 'KNO-TL12',
      reportGroup: 'KNO',
      kind: 'Rutin',
      schedule: 'Per 2 minggu: 12 Okt, 26 Okt, 9 Nov, 23 Nov, 7 Des 2026 (batas = cek berikutnya)',
      dueDate: '2026-10-12',
      status: 'Belum Mulai',
      progress: 0,
    }, // stored date is stale; rolling → 9 Nov, 7 days
    {
      code: 'KNO-TL13',
      reportGroup: 'KNO',
      kind: 'Rutin',
      schedule: 'Setiap Jumat, 16 Okt – 18 Des 2026 (batas = Jumat berikutnya)',
      dueDate: '2026-10-16',
      status: 'Belum Mulai',
      progress: 0,
    }, // rolling → Fri 6 Nov, 4 days
  ],
  replacements: [
    // deadline 31 Oct 2026, today 2 Nov 2026
    { reportGroup: 'SUB', replacedName: 'Petugas A', replacementName: 'Pengganti 1', effectiveOn: '2026-10-31', postTest: 85, practiceAvg: 4, reported: 'Ya' }, // Tepat waktu, Lulus
    { reportGroup: 'SUB', replacedName: 'Petugas B', replacementName: null, effectiveOn: null, postTest: null, practiceAvg: null, reported: 'Belum' }, // OVERDUE
    { reportGroup: 'KNO', replacedName: 'Petugas G', replacementName: 'Pengganti 2', effectiveOn: '2026-11-01', postTest: 79, practiceAvg: 4.5, reported: 'Ya' }, // Lewat 31 Okt, Belum lulus
    { reportGroup: 'CGK & HLP', replacedName: 'Petugas F', replacementName: 'Pengganti 3', effectiveOn: null, postTest: null, practiceAvg: null, reported: null }, // OVERDUE, Belum training/dinilai
    { reportGroup: 'DPS', replacedName: 'Petugas D', replacementName: 'Pengganti 4', effectiveOn: '2026-10-20', postTest: 80, practiceAvg: 3.99, reported: 'Belum' }, // Tepat waktu, Belum lulus
  ],
};
