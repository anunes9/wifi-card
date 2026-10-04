import { describe, expect, it } from 'vitest';
import {
  applyMessage, buildPlan, delimName, EXAMPLE, listAsCsv, looksLikeHeader, parseDelimited,
  rowToUnit, sniffDelim, type Field,
} from './csv';
import type { Plan, UnitData } from './types';

const unit = (over: Partial<UnitData> = {}): UnitData => ({
  ref: '', ssid: '', pass: '', auth: 'WPA', hidden: false, ...over,
});
const row = (s: string, d = ','): Field[] => parseDelimited(s, d)[0];

describe('sniffDelim', () => {
  it('picks the separator that occurs most', () => {
    expect(sniffDelim('a,b,c')).toBe(',');
    expect(sniffDelim('a;b;c')).toBe(';');
    expect(sniffDelim('a\tb\tc')).toBe('\t');
  });
  it('prefers tab, then semicolon, then comma on a tie', () => {
    expect(sniffDelim('a;b,c')).toBe(';');
    expect(sniffDelim('a\tb;c')).toBe('\t');
  });
  it('ignores separators inside quotes', () => {
    expect(sniffDelim('"x;y;z",b,c')).toBe(',');
  });
  it('defaults to comma', () => {
    expect(sniffDelim('abc')).toBe(',');
  });
});

describe('parseDelimited', () => {
  it('splits rows and fields', () => {
    expect(parseDelimited('a,b\nc,d', ',')).toEqual([
      [{ v: 'a', q: false }, { v: 'b', q: false }],
      [{ v: 'c', q: false }, { v: 'd', q: false }],
    ]);
  });
  it('handles doubled quotes and separators inside quotes', () => {
    expect(parseDelimited('"p,a""ss",x', ',')).toEqual([[{ v: 'p,a"ss', q: true }, { v: 'x', q: false }]]);
  });
  it('allows blanks before an opening quote and drops blanks after the closing one', () => {
    expect(parseDelimited('a, "b c" ,d', ',')).toEqual([
      [{ v: 'a', q: false }, { v: 'b c', q: true }, { v: 'd', q: false }],
    ]);
  });
  it('strips the BOM and handles CRLF', () => {
    expect(parseDelimited('﻿a;b\r\nc;d\r\n', ';').map((r) => r.map((f) => f.v))).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
  it('drops blank lines', () => {
    expect(parseDelimited('a,b\n\n , \nc,d', ',')).toHaveLength(2);
  });
  it('keeps unquoted fields raw (trimming happens later)', () => {
    expect(row(' a ,b')[0]).toEqual({ v: ' a ', q: false });
  });
});

describe('looksLikeHeader', () => {
  it('spots English and Portuguese headings', () => {
    expect(looksLikeHeader(row('Unit,Network,Password'))).toBe(true);
    expect(looksLikeHeader(row('Unidade;Rede;Palavra-passe', ';'))).toBe(true);
    expect(looksLikeHeader(row('Apartamento,Nome da rede,Senha'))).toBe(true);
    expect(looksLikeHeader(row('Imóvel,SSID,Código'))).toBe(true);
  });
  it('does not take a real first row for a header', () => {
    expect(looksLikeHeader(row('Alfama T2, Lisbeyond_Wifi, senha2026'))).toBe(false);
  });
  it('needs two matching columns', () => {
    expect(looksLikeHeader(row('Unit, Lisbeyond, x'))).toBe(false);
  });
});

describe('rowToUnit', () => {
  it('trims unquoted cells and keeps quoted ones as-is', () => {
    expect(rowToUnit(row(' Alfama T2 , Net ,"  spaced pass  "'))).toEqual(
      unit({ ref: 'Alfama T2', ssid: 'Net', pass: '  spaced pass  ' }),
    );
  });
  it('reads security from column 4', () => {
    expect(rowToUnit(row('A,Net,pw,open')).auth).toBe('nopass');
    expect(rowToUnit(row('A,Net,pw,Aberta')).auth).toBe('nopass');
    expect(rowToUnit(row('A,Net,pw,WEP')).auth).toBe('WEP');
    expect(rowToUnit(row('A,Net,pw,wpa2')).auth).toBe('WPA');
  });
  it('reads hidden from column 5', () => {
    expect(rowToUnit(row('A,Net,pw,,sim')).hidden).toBe(true);
    expect(rowToUnit(row('A,Net,pw,,Oculta')).hidden).toBe(true);
    expect(rowToUnit(row('A,Net,pw,,no')).hidden).toBe(false);
  });
});

describe('buildPlan', () => {
  it('returns null for blank input', () => {
    expect(buildPlan('', 'replace', [])).toBeNull();
    expect(buildPlan('   \n ', 'replace', [])).toBeNull();
  });

  it('turns a lone header line into an empty plan', () => {
    const plan = buildPlan('Unit,Network,Password', 'replace', [])!;
    expect(plan.header).toBe(true);
    expect(plan.items).toEqual([]);
    expect(plan.added).toBe(0);
  });

  it('reads the example as three new units after a header', () => {
    const plan = buildPlan(EXAMPLE, 'replace', [])!;
    expect(plan).toMatchObject({ mode: 'replace', delim: ',', header: true, added: 3, updated: 0, skipped: 0 });
    expect(plan.items.map((it) => [it.line, it.action, it.u.ref])).toEqual([
      [2, 'add', 'Alfama T2'],
      [3, 'add', 'Graça T1'],
      [4, 'add', 'Príncipe Real T3'],
    ]);
  });

  it('skips rows without a network name, saying why', () => {
    const plan = buildPlan('A only\n,,pw\nB,Net,secret123', 'replace', [])!;
    expect(plan.items.map((it) => [it.line, it.action, it.notes])).toEqual([
      [1, 'skip', ['only one column on this line — check the separator']],
      [2, 'skip', ['no network name']],
      [3, 'add', []],
    ]);
    expect(plan).toMatchObject({ added: 1, skipped: 2 });
  });

  it('notes problems on usable rows', () => {
    const plan = buildPlan(
      'A,Net\nB,Net2,short\nA,Net3,longenough1\nC,Net4,longenough1,WPA,no,extra\nD,Open,,open',
      'replace', [],
    )!;
    expect(plan.items.map((it) => it.notes)).toEqual([
      ['no password'],
      ['WPA password under 8 characters'],
      ['reference repeats line 1'],
      ['extra columns after column 5 ignored'],
      [],
    ]);
  });

  it('keeps a separator inside a quoted password', () => {
    const plan = buildPlan('A;Net;"pa;ss;word"', 'replace', [])!;
    expect(plan.delim).toBe(';');
    expect(plan.items[0].u.pass).toBe('pa;ss;word');
  });

  it('only adds in append mode', () => {
    const plan = buildPlan('Alfama T2,N,password1', 'append', [unit({ ref: 'Alfama T2', ssid: 'Old' })])!;
    expect(plan.items[0].action).toBe('add');
    expect(plan).toMatchObject({ added: 1, updated: 0 });
  });

  it('merges by reference, ignoring case and extra spaces, against existing units only', () => {
    const existing = [unit({ ref: 'Alfama  T2', ssid: 'Old' }), unit({ ref: '', ssid: 'X' })];
    const plan = buildPlan('alfama t2,NewNet,newpass123\nGraça,G,graça1234\nGRAÇA,G2,graça1234', 'merge', existing)!;
    expect(plan.items.map((it) => [it.action, it.at, it.notes])).toEqual([
      ['update', 0, []],
      ['add', undefined, []],
      ['add', undefined, ['reference repeats line 2']],
    ]);
    expect(plan).toMatchObject({ updated: 1, added: 2 });
  });

  it('matches the first of two existing units with the same reference', () => {
    const plan = buildPlan('X,N,password1', 'merge', [unit({ ref: 'X' }), unit({ ref: 'x' })])!;
    expect(plan.items[0].at).toBe(0);
  });
});

describe('delimName', () => {
  it('names the separator', () => {
    expect(delimName('\t')).toBe('tabs');
    expect(delimName(';')).toBe('semicolons');
    expect(delimName(',')).toBe('commas');
  });
});

describe('applyMessage', () => {
  const plan = (p: Partial<Plan>): Plan => ({
    mode: 'replace', delim: ',', header: false, items: [], added: 0, updated: 0, skipped: 0, ...p,
  });
  const tail = ' Check the warnings under the table before printing.';

  it('describes a replace', () => {
    expect(applyMessage(plan({ added: 3 }))).toBe('Replaced the list with 3 units.' + tail);
    expect(applyMessage(plan({ added: 1 }))).toBe('Replaced the list with 1 unit.' + tail);
  });
  it('describes a merge with skips', () => {
    expect(applyMessage(plan({ mode: 'merge', updated: 1, added: 2, skipped: 1 }))).toBe(
      'Updated 1, added 2. 1 line skipped for having no network name.' + tail,
    );
  });
  it('describes an append with skips', () => {
    expect(applyMessage(plan({ mode: 'append', added: 2, skipped: 2 }))).toBe(
      'added 2. 2 lines skipped for having no network name.' + tail,
    );
  });
});

describe('listAsCsv', () => {
  const units = [
    unit({ ref: 'A', ssid: 'N,1', pass: 'p"q' }),
    unit(),
    unit({ ssid: 'O', auth: 'nopass', hidden: true }),
    unit({ ref: 'W', ssid: 'Old', pass: 'abcde', auth: 'WEP' }),
  ];

  it('quotes what needs quoting and skips empty rows', () => {
    expect(listAsCsv(units)).toBe(
      'Unit reference,Network name,Password,Security,Hidden\n' +
      'A,"N,1","p""q",WPA,\n' +
      ',O,,nopass,yes\n' +
      'W,Old,abcde,WEP,',
    );
  });

  it('reads back through buildPlan to the same units', () => {
    const plan = buildPlan(listAsCsv(units), 'replace', [])!;
    expect(plan.header).toBe(true);
    expect(plan.items.map((it) => it.u)).toEqual([units[0], units[2], units[3]]);
  });
});
