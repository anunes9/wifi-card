import { Fragment, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode } from 'react';
import { applyMessage, buildPlan, delimName, EXAMPLE, listAsCsv } from '@/lib/csv';
import { hasContent, type Action } from '@/lib/units';
import type { BulkMode, Plan, PlanItem, Unit } from '@/lib/types';

const MODES: { value: BulkMode; label: string; hint: string }[] = [
  { value: 'replace', label: 'Replace the list', hint: 'The pasted rows become the whole list' },
  { value: 'append', label: 'Add to the list', hint: 'Keep what is there, append the new rows' },
  { value: 'merge', label: 'Update by reference', hint: 'Overwrite matching units, append the rest' },
];

const PLACEHOLDER = 'Unit,Network,Password\nAlfama T2,Lisbeyond_Alfama,Bemvindo2026\nGraça T1,Lisbeyond_Graca,OlaLisboa25';
const COPY_LABEL = 'Copy the current list as CSV';

interface BulkImportProps {
  open: boolean;
  onClose: () => void;
  units: Unit[];
  dispatch: Dispatch<Action>;
}

export default function BulkImport({ open, onClose, units, dispatch }: BulkImportProps) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<BulkMode>('replace');
  // The message left by Apply. While it shows, the preview is hidden and Apply
  // stays off, so the same paste cannot be applied twice.
  const [result, setResult] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState(COPY_LABEL);
  const csvRef = useRef<HTMLTextAreaElement>(null);

  // Reopening the panel starts a fresh look at whatever is in the box.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setResult(null);
  }

  useEffect(() => {
    if (open) csvRef.current?.focus();
  }, [open]);

  const plan = useMemo(() => buildPlan(text, mode, units), [text, mode, units]);
  const shown = result === null ? plan : null;
  const usable = shown ? shown.added + shown.updated : 0;

  const apply = () => {
    if (!plan || !(plan.added + plan.updated)) return;
    dispatch({ type: 'applyPlan', plan });
    setResult(applyMessage(plan));
  };

  const example = () => {
    setText(EXAMPLE);
    setResult(null);
    csvRef.current?.focus();
  };

  const copy = () => {
    const done = (ok: boolean) => {
      setCopyLabel(ok ? 'Copied' : 'Copy failed');
      setTimeout(() => setCopyLabel(COPY_LABEL), 1600);
    };
    if (!navigator.clipboard) return done(false);
    navigator.clipboard.writeText(listAsCsv(units)).then(() => done(true), () => done(false));
  };

  return (
    <div className="bulk noprint" id="bulk" hidden={!open}>
      <div className="bulk-top">
        <h3>Bulk update from a spreadsheet</h3>
        <button className="ghost tiny" id="bulk-close" onClick={onClose}>Close</button>
      </div>
      <p className="bulk-help">One line per apartment, in this order: <code>unit reference, network name, password</code> — commas, semicolons and tabs all work, so you can copy cells straight out of Excel or Google Sheets. Security is set to <strong>WPA/WPA2/WPA3</strong> on every row. A header line is spotted and skipped. Nothing changes until you press Apply.</p>
      <textarea
        id="csv"
        ref={csvRef}
        spellCheck={false}
        autoComplete="off"
        placeholder={PLACEHOLDER}
        value={text}
        onChange={(e) => { setText(e.target.value); setResult(null); }}
      />

      <div className="modes">
        {MODES.map((m) => (
          <label key={m.value}>
            <input type="radio" name="bulk-mode" value={m.value} checked={mode === m.value} onChange={() => { setMode(m.value); setResult(null); }} />
            <span>{m.label}<span className="hint">{m.hint}</span></span>
          </label>
        ))}
      </div>

      <Status plan={shown} result={result} units={units} />
      <div className="preview-scroll"><div id="bulk-preview">{shown ? <Preview plan={shown} /> : null}</div></div>

      <div className="toolbar">
        <button id="bulk-apply" disabled={!usable} onClick={apply}>Apply to the list</button>
        <button className="ghost" id="bulk-example" onClick={example}>Insert an example</button>
        <span className="spacer"></span>
        <button className="ghost" id="bulk-copy" onClick={copy}>{copyLabel}</button>
      </div>
    </div>
  );
}

function Status({ plan, result, units }: { plan: Plan | null; result: string | null; units: Unit[] }) {
  if (result !== null) return <div className="status ok" id="bulk-status">{result}</div>;
  if (!plan) return <div className="status" id="bulk-status">Paste your rows above to see what will happen.</div>;

  const usable = plan.added + plan.updated;
  const cls = 'status ' + (!usable ? 'err' : plan.skipped ? 'warn' : 'ok');
  if (!usable) {
    return (
      <div className={cls} id="bulk-status">
        {!plan.items.length
          ? 'That is just the header line — paste the unit rows underneath it.'
          : <>Nothing usable found — every line is missing a network name. Check that the columns are <b>reference, network, password</b>, and that the separator is a comma, a semicolon or a tab.</>}
      </div>
    );
  }

  const bits: Seg[][] = [];
  if (plan.mode === 'replace') {
    const now = units.filter(hasContent).length;
    const n: Seg[] = [{ b: usable }, ' unit' + (usable === 1 ? '' : 's')];
    bits.push(now ? [...n, ' will replace the ', { b: now }, ' now in the list'] : [...n, ' will become the list']);
  } else {
    if (plan.updated) bits.push([{ b: plan.updated }, ' updated']);
    bits.push([{ b: plan.added }, ' added']);
  }
  if (plan.skipped) bits.push([{ b: plan.skipped }, ' skipped']);
  bits.push(['read as ' + delimName(plan.delim) + (plan.header ? ', header line skipped' : '')]);

  return <div className={cls} id="bulk-status">{render(bits.flatMap((b, i) => (i > 0 ? [' · ', ...b] : b)))}</div>;
}

// Bold numbers between plain text. Neighbouring strings are merged into one
// text node, because Chrome shapes each text node on its own, and split nodes
// set the line a few pixels differently from the original page.
type Seg = string | { b: number };

function render(segs: Seg[]): ReactNode[] {
  const merged: Seg[] = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (typeof s === 'string' && typeof last === 'string') merged[merged.length - 1] = last + s;
    else merged.push(s);
  }
  return merged.map((s, i) => (typeof s === 'string' ? <Fragment key={i}>{s}</Fragment> : <b key={i}>{s.b}</b>));
}

function Preview({ plan }: { plan: Plan }) {
  return (
    <table className="preview">
      <thead>
        <tr><th>Line</th><th>Unit reference</th><th>Network</th><th>Password</th><th>Security</th><th></th></tr>
      </thead>
      <tbody>
        {plan.items.map((it) => (
          <tr key={it.line}>
            <td className="n">{it.line}</td>
            <td>{it.u.ref || <span className="why">—</span>}</td>
            <td className="m">{it.u.ssid}</td>
            <td className="m">{it.u.auth === 'nopass' ? <span className="why">open</span> : it.u.pass}</td>
            <td>{(it.u.auth === 'WPA' ? 'WPA/2/3' : it.u.auth === 'WEP' ? 'WEP' : 'Open') + (it.u.hidden ? ' · hidden' : '')}</td>
            <td><Tag item={it} mode={plan.mode} />{it.notes.length ? <span className="why">{it.notes.join(' · ')}</span> : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Tag({ item, mode }: { item: PlanItem; mode: BulkMode }) {
  if (item.action === 'skip') return <span className="tag skip">Skipped</span>;
  if (item.action === 'update') return <span className="tag upd">Update</span>;
  if (mode === 'replace') return <span className="tag">Card</span>;
  return <span className="tag new">New</span>;
}
