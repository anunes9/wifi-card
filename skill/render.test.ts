import { describe, expect, it } from 'vitest';
import { renderCards } from './render';

const CSS = "@font-face{src:url('/fonts/Lexend-400.ttf')}";
const ASSETS = { '/fonts/Lexend-400.ttf': 'data:font/ttf;base64,AAAA', '/img/logo.png': 'data:image/png;base64,BBBB' };

describe('renderCards', () => {
  it('makes one card per row with a network name, skipping the header', () => {
    const { html, report } = renderCards('Unit,Network,Password\nAlfama T2,Lisbeyond_Alfama,Bemvindo2026\nGraça T1,Lisbeyond_Graca,OlaLisboa25\n', CSS, ASSETS);
    expect(report).toMatchObject({ cards: 2, sheets: 1, header: true, delimiter: 'commas', skipped: [] });
    expect(html.match(/class="card/g)).toHaveLength(2);
    expect(html).toContain('Lisbeyond_Graca');
    expect(html).toContain('Graça T1');
  });

  it('inlines the fonts and images so the page needs no server', () => {
    const { html } = renderCards('A,Net,password1', CSS, ASSETS);
    expect(html).toContain("url('data:font/ttf;base64,AAAA')");
    expect(html).toContain('src="data:image/png;base64,BBBB"');
    expect(html).not.toMatch(/["'(]\/(fonts|img)\//);
  });

  it('reports skipped lines and cards that will not work', () => {
    const { report } = renderCards('A;Net;short\nonly-one-column\n', CSS, ASSETS);
    expect(report.cards).toBe(1);
    expect(report.skipped).toEqual([{ line: 2, why: 'only one column on this line — check the separator' }]);
    expect(report.warnings.some((w) => w.err && /8 characters/.test(w.msg))).toBe(true);
  });

  it('switches design and can leave the reference off', () => {
    const { html } = renderCards('Alfama T2,Net,password1', CSS, ASSETS, { design: '2', showRef: false });
    expect(html).toContain('class="card d2"');
    expect(html).not.toContain('Alfama T2</p>');
  });

  it('keeps quoted passwords exactly and escapes them in the page', () => {
    const { html } = renderCards('A,Net," <b>pass;word "', CSS, ASSETS);
    expect(html).toContain('&lt;b&gt;pass;word ');
    expect(html).not.toContain('<b>pass');
  });
});
