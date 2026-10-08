import { describe, expect, test } from 'bun:test';
import { DEFAULT_SETTINGS } from '../rules';
import type { Workspace } from './index';
import { changedVia, lastChangedLabel, parseStation, ruleSettings, settingsComplete, stationCodes } from './view';

const ws = {
  scope: 'KPS',
  isKps: true,
  linkId: 'own',
  linkLabels: { other: 'PIC SUB' },
  stations: [
    { code: 'DPS', reportGroup: 'DPS', sort: 2 },
    { code: 'SUB', reportGroup: 'SUB', sort: 1 },
  ],
} as unknown as Workspace;

describe('workspace view', () => {
  test('ruleSettings keeps database values and falls back to the workbook defaults', () => {
    const s = ruleSettings({ weeks: 8, passAvgMin: 4.5, minHeightFemale: 155 } as Workspace['settings']);
    expect(s.weeks).toBe(8);
    expect(s.passAvgMin).toBe(4.5);
    expect(s.minHeightFemale).toBe(155);
    expect(s.minHeightMale).toBeNull();
    expect(s.week1Start).toBe(DEFAULT_SETTINGS.week1Start);
    expect(settingsComplete({ weeks: 8 } as Workspace['settings'])).toBe(false);
  });

  test('station order and the KPS filter', () => {
    expect(stationCodes(ws)).toEqual(['SUB', 'DPS']);
    expect(parseStation(ws, 'dps')).toBe('DPS');
    expect(parseStation(ws, 'KNO')).toBeNull();
    expect(parseStation({ ...ws, isKps: false } as Workspace, 'DPS')).toBeNull();
  });

  test('last changed via', () => {
    expect(changedVia({ updatedByLink: 'own' }, ws)).toBe('tautan ini');
    expect(changedVia({ updatedByLink: 'other' }, ws)).toBe('PIC SUB');
    expect(changedVia({ updatedByLink: 'gone' }, ws)).toBe('tautan lain');
    expect(changedVia({ updatedByLink: null }, ws)).toBe('pemilik / Google Sheet');
    expect(lastChangedLabel({ updatedByLink: 'own', updatedAt: '2026-10-08T07:05:00Z' }, ws)).toBe(
      'Diubah lewat tautan ini, 8 Okt 14.05',
    );
  });
});
