import { describe, expect, test } from 'bun:test';
import { OWNER_ACCESS, OWNER_ACCESS_KEY, SHEETS, hrefs, linkAccess, toQuery } from './access';

const TOKEN = 'a'.repeat(48);

describe('workspace access', () => {
  test('link and owner access carry their base path and action key', () => {
    const link = linkAccess(TOKEN);
    expect(link).toEqual({ kind: 'link', token: TOKEN, key: TOKEN, basePath: `/s/${TOKEN}` });
    expect(OWNER_ACCESS).toEqual({ kind: 'owner', key: OWNER_ACCESS_KEY, basePath: '/admin' });
    // The owner key can never be mistaken for a token.
    expect(/^[0-9a-f]{48}$/i.test(OWNER_ACCESS_KEY)).toBe(false);
  });

  test('every sheet path hangs off the base path', () => {
    const owner = hrefs(OWNER_ACCESS);
    expect(owner.dashboard).toBe('/admin');
    expect(owner.sdm).toBe('/admin/sdm');
    expect(owner.tindakLanjut).toBe('/admin/tindak-lanjut');
    const link = hrefs(linkAccess(TOKEN));
    expect(link.dashboard).toBe(`/s/${TOKEN}`);
    expect(link.laporan).toBe(`/s/${TOKEN}/laporan`);
    expect(SHEETS.map((s) => s.label)).toEqual([
      'Dashboard',
      'Master SDM',
      'Log Performa',
      'Cek BMI',
      'Tindak Lanjut',
      'Penggantian SDM',
      'Laporan Mingguan',
    ]);
  });

  test('to() adds the query and hash, skipping empty values', () => {
    const links = hrefs(OWNER_ACCESS);
    expect(links.to('bmi', { periode: 2, stasiun: 'SUB' })).toBe('/admin/bmi?periode=2&stasiun=SUB');
    expect(links.to('performa', { minggu: 3, stasiun: null, tab: undefined, lp: false, cek: '' })).toBe(
      '/admin/performa?minggu=3',
    );
    expect(links.to('tindakLanjut', undefined, 'tl-SUB-TL01')).toBe('/admin/tindak-lanjut#tl-SUB-TL01');
    expect(links.to('dashboard')).toBe('/admin');
    expect(toQuery({ a: 'x y' })).toBe('?a=x+y');
  });
});
