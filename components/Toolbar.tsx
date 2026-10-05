interface ToolbarProps {
  count: number;
  onAdd: () => void;
  onToggleBulk: () => void;
  onClear: () => void;
}

export default function Toolbar({ count, onAdd, onToggleBulk, onClear }: ToolbarProps) {
  return (
    <div className="toolbar">
      <button id="add" onClick={onAdd}>+ Add unit</button>
      <button className="ghost" id="bulk-open" onClick={onToggleBulk}>Paste CSV…</button>
      <button className="ghost" id="clear" onClick={onClear}>Clear all</button>
      <span className="count" id="count">{count ? `${count} ${count === 1 ? 'card' : 'cards'}` : ''}</span>
      <span className="spacer"></span>
      <button id="print" onClick={() => window.print()}>Print cards</button>
    </div>
  );
}
