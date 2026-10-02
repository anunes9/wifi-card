(function () {
  'use strict';

  var LOGO = 'assets/img/logo.png';
  var STORE = 'lisbeyond.wificards.v1';



  var rowsEl = document.getElementById('rows');
  var sheetEl = document.getElementById('sheet');
  var warnEl = document.getElementById('warnings');
  var optRef = document.getElementById('opt-ref');
  var optPayload = document.getElementById('opt-payload');
  var optDesign = document.getElementById('opt-design');
  var SKYLINE = 'assets/img/skyline.png';

  var units = load();
  if (!units.length) units = [blank()];

  function blank() { return { ref: '', ssid: '', pass: '', auth: 'WPA', hidden: false }; }

  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed.units) ? parsed.units : [];
    } catch (e) { return []; }
  }

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        units: units,
        showRef: optRef.checked,
        showPayload: optPayload.checked,
        design: optDesign.value
      }));
    } catch (e) { /* private browsing — the page still works, it just won't remember */ }
  }

  try {
    var saved = JSON.parse(localStorage.getItem(STORE) || '{}');
    if (typeof saved.showRef === 'boolean') optRef.checked = saved.showRef;
    if (typeof saved.showPayload === 'boolean') optPayload.checked = saved.showPayload;
    if (saved.design === '1' || saved.design === '2') optDesign.value = saved.design;
  } catch (e) {}

  // ---- editor -------------------------------------------------------------
  function drawRows() {
    rowsEl.innerHTML = '';
    units.forEach(function (u, i) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><input type="text" class="ref" placeholder="Alfama T2" value="' + esc(u.ref) + '"></td>' +
        '<td><input type="text" class="ssid mono" placeholder="Lisbeyond_Guest" value="' + esc(u.ssid) + '"></td>' +
        '<td><input type="text" class="pass mono" placeholder="Bemvindo2026" value="' + esc(u.pass) + '"></td>' +
        '<td><select class="auth">' +
          '<option value="WPA"' + (u.auth === 'WPA' ? ' selected' : '') + '>WPA / WPA2 / WPA3</option>' +
          '<option value="WEP"' + (u.auth === 'WEP' ? ' selected' : '') + '>WEP (old)</option>' +
          '<option value="nopass"' + (u.auth === 'nopass' ? ' selected' : '') + '>Open, no password</option>' +
        '</select></td>' +
        '<td class="mid"><input type="checkbox" class="hidden"' + (u.hidden ? ' checked' : '') + '></td>' +
        '<td class="mid"><button class="ghost tiny del" title="Remove this unit">✕</button></td>';

      tr.querySelector('.ref').addEventListener('input', function (e) { u.ref = e.target.value; touch(); });
      tr.querySelector('.ssid').addEventListener('input', function (e) { u.ssid = e.target.value; touch(); });
      tr.querySelector('.pass').addEventListener('input', function (e) { u.pass = e.target.value; touch(); });
      tr.querySelector('.auth').addEventListener('change', function (e) { u.auth = e.target.value; touch(); });
      tr.querySelector('.hidden').addEventListener('change', function (e) { u.hidden = e.target.checked; touch(); });
      tr.querySelector('.del').addEventListener('click', function () {
        units.splice(i, 1);
        if (!units.length) units.push(blank());
        touch(); drawRows();
      });
      rowsEl.appendChild(tr);
    });
    flagRows();
  }

  // Redraws the cards without rebuilding the inputs, so typing never steals focus.
  function touch() { save(); render(); flagRows(); }

  function flagRows() {
    var trs = rowsEl.querySelectorAll('tr');
    units.forEach(function (u, i) {
      if (!trs[i]) return;
      var filled = u.ref || u.ssid || u.pass;
      trs[i].classList.toggle('bad', !!filled && !u.ssid.trim());
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  // ---- cards --------------------------------------------------------------
  function active() {
    return units.filter(function (u) { return u.ssid.trim(); });
  }

  function cardEl(u, idx) {
    var d = document.createElement('div');
    d.className = 'card' + (idx % 2 === 1 ? ' cut-top' : '');

    var payload = QR.wifiPayload({
      ssid: u.ssid, password: u.pass, auth: u.auth, hidden: u.hidden
    });

    var svg = '';
    try {
      var qr = QR.encode(payload, { ecl: 'Q' });
      var p = QR.toSvgPath(qr, 4);
      // DARK_MM is the printed size of the dark square itself. The svg is drawn
      // larger to hold the quiet zone, then pulled back by exactly that margin,
      // so the square lines up with the gutter whatever version the QR lands on.
      var DARK_MM = optDesign.value === '2' ? 40 : 58;
      var box = (DARK_MM * p.dim / qr.size).toFixed(2);
      var bleed = (DARK_MM * 4 / qr.size).toFixed(2);
      svg = '<svg class="c-qr" viewBox="0 0 ' + p.dim + ' ' + p.dim + '" ' +
            'style="width:' + box + 'mm;height:' + box + 'mm;margin:-' + bleed + 'mm" ' +
            'xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">' +
            '<rect width="' + p.dim + '" height="' + p.dim + '"/><path d="' + p.path + '"/></svg>';
    } catch (e) {
      svg = '<p class="c-empty">' + esc(e.message) + '</p>';
    }

    var ref = optRef.checked && u.ref ? esc(u.ref) : '';
    var pay = optPayload.checked ? '<div class="payload">' + esc(payload) + '</div>' : '';
    var fields =
      '<div class="c-field"><p class="c-label">Rede / Network</p>' +
      '<p class="c-value">' + esc(u.ssid) + '</p></div>' +
      (u.auth === 'nopass' ? '' :
        '<div class="c-field"><p class="c-label">Palavra-passe / Password</p>' +
        '<p class="c-value">' + esc(u.pass) + '</p></div>');

    if (optDesign.value === '2') {
      d.className += ' d2';
      d.innerHTML =
        '<div class="c-frame">' +
          '<img class="c-sky" src="' + SKYLINE + '" alt="">' +
          '<div class="c-bubble">' +
            '<p class="c-say">Aponte a câmara do telemóvel.</p>' +
            '<p class="c-say2">Point your phone camera.</p>' +
            '<div class="c-row">' +
              '<div class="c-qrbox">' + svg + '</div>' +
              '<div class="c-body">' + fields + pay + '</div>' +
            '</div>' +
            '<div class="c-tail"></div>' +
          '</div>' +
          (ref ? '<p class="c-ref">' + ref + '</p>' : '') +
        '</div>';
      return d;
    }

    d.innerHTML =
      '<div class="c-frame">' +
        '<div class="c-main">' +
          '<div class="c-qrbox"><div class="c-qrwrap">' + svg +
            '<div class="c-under">' +
              '<p class="c-scan">Aponte a câmara do telemóvel' +
              '<span class="en">Point your phone camera</span></p>' +
              (ref ? '<p class="c-ref">' + ref + '</p>' : '') +
            '</div>' +
          '</div></div>' +
          '<div class="c-body">' +
            '<p class="c-title">Wi-Fi</p>' + fields + pay +
          '</div>' +
        '</div>' +
        '<div class="c-foot">' +
          '<img class="c-mark" src="' + LOGO + '" alt="Lisbeyond">' +
        '</div>' +
      '</div>';
    return d;
  }

  function render() {
    var list = active();
    sheetEl.innerHTML = '';
    refreshCount();
    if (!list.length) {
      sheetEl.innerHTML = '<div class="card"><p class="c-empty">Add a unit with a network ' +
        'name to see its card here.</p></div>';
      warn([]);
      return;
    }
    list.forEach(function (u, i) { sheetEl.appendChild(cardEl(u, i)); });
    warn(checkAll(list));
  }

  // ---- guardrails ---------------------------------------------------------
  /* These are the failure modes that produce a card nobody can use: a QR that
     scans into the wrong credentials, or one too dense to read off paper. */
  function checkAll(list) {
    var out = [];
    var seen = {};

    list.forEach(function (u) {
      var who = u.ref ? '"' + u.ref + '"' : 'network "' + u.ssid + '"';

      if (u.auth !== 'nopass' && !u.pass) {
        out.push({ err: true, msg: who + ' has no password. Set one, or switch it to "Open, no password".' });
      }
      if (u.auth === 'WPA' && u.pass && u.pass.length < 8) {
        out.push({ err: true, msg: who + ': a WPA password must be at least 8 characters — phones will refuse to join.' });
      }
      if (/^\s|\s$/.test(u.ssid) || /^\s|\s$/.test(u.pass)) {
        out.push({ err: true, msg: who + ' starts or ends with a space. That is almost always a typo, and it will not join.' });
      }

      var key = JSON.stringify([u.ssid, u.pass]);
      if (seen[key]) out.push({ msg: who + ' repeats the same network and password as ' + seen[key] + '.' });
      else seen[key] = who;

      var payload = QR.wifiPayload({ ssid: u.ssid, password: u.pass, auth: u.auth, hidden: u.hidden });
      try {
        var qr = QR.encode(payload, { ecl: 'Q' });
        if (qr.version >= 10) {
          out.push({ msg: who + ' makes a dense QR (version ' + qr.version +
            '). It still scans, but a shorter password prints more reliably.' });
        }
      } catch (e) {
        out.push({ err: true, msg: who + ': ' + e.message });
      }

      if (/[^\x20-\x7E]/.test(u.ssid + u.pass)) {
        out.push({ msg: who + ' contains accented or non-English characters. They are encoded correctly, ' +
          'but a few older Android scanners mis-read them — worth testing one card.' });
      }
    });

    return out;
  }

  function warn(list) {
    warnEl.innerHTML = '';
    list.forEach(function (w) {
      var li = document.createElement('li');
      if (w.err) li.className = 'err';
      li.textContent = w.msg;
      warnEl.appendChild(li);
    });
  }

  // ---- bulk CSV import ----------------------------------------------------
  /* The team keeps its networks in a spreadsheet, so pasting beats typing. The
     rules here are chosen for what actually lands in the box:
       - Excel on a Portuguese machine exports semicolons, not commas.
       - Copying cells out of a sheet gives tabs.
       - So the delimiter is sniffed rather than assumed.
     Quoting is RFC 4180 (doubled "" inside a quoted field), which matters because
     a password may legitimately contain the delimiter. Unquoted fields are
     trimmed — stray spaces there are always artefacts of the copy — while quoted
     fields are kept byte for byte, since quoting is how a sheet says "I meant
     this exactly". */
  var bulkEl = document.getElementById('bulk');
  var csvEl = document.getElementById('csv');
  var bulkStatusEl = document.getElementById('bulk-status');
  var bulkPreviewEl = document.getElementById('bulk-preview');
  var bulkApplyEl = document.getElementById('bulk-apply');
  var countEl = document.getElementById('count');

  var EXAMPLE = [
    'Unit,Network,Password',
    'Alfama T2,Lisbeyond_Alfama,Bemvindo2026',
    'Graça T1,Lisbeyond_Graca,OlaLisboa25',
    'Príncipe Real T3,Lisbeyond_PRoyal,BoaEstadia!24'
  ].join('\n');

  // What Apply would do, recomputed on every keystroke. Kept in one place so the
  // preview and the apply can never disagree about the outcome.
  var plan = null;

  function countOutside(text, ch) {
    var n = 0, inQ = false;
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if (c === '"') inQ = !inQ;
      else if (!inQ && c === ch) n++;
    }
    return n;
  }

  // Tab first, then semicolon, then comma: a tab or a semicolon in the paste is a
  // deliberate separator, whereas a comma is just as likely to sit in a password.
  function sniffDelim(text) {
    var best = ',', bestN = 0;
    ['\t', ';', ','].forEach(function (d) {
      var n = countOutside(text, d);
      if (n > bestN) { bestN = n; best = d; }
    });
    return best;
  }

  function parseDelimited(text, delim) {
    var rows = [], row = [], field = '', quoted = false, inQ = false, closed = false;
    text = text.replace(/^\uFEFF/, '');       // Excel's UTF-8 BOM
    function endField() {
      row.push({ v: field, q: quoted });
      field = ''; quoted = false; closed = false;
    }
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if (inQ) {
        if (c !== '"') { field += c; }
        else if (text.charAt(i + 1) === '"') { field += '"'; i++; }   // "" is one "
        else { inQ = false; closed = true; }
      }
      // Strict RFC 4180 wants the quote flush against the delimiter, but both
      // Excel and Sheets happily emit `, "value"` \u2014 so allow leading blanks
      // before the quote, and drop the blanks that follow the closing one.
      else if (c === '"' && !quoted && !/\S/.test(field)) { inQ = true; quoted = true; field = ''; }
      else if (c === delim) { endField(); }
      else if (c === '\n') { endField(); rows.push(row); row = []; }
      else if (c === '\r') { /* CRLF \u2014 the \n does the work */ }
      else if (!(closed && !/\S/.test(c))) { field += c; }
    }
    endField(); rows.push(row);
    return rows.filter(function (r) {
      return r.some(function (f) { return f.v.trim() !== ''; });
    });
  }

  function cell(f) { return f ? (f.q ? f.v : f.v.trim()) : ''; }

  /* Header detection is deliberately strict, and per column. A loose "does the
     line mention wifi or senha anywhere" test throws away a real first row like
     `Alfama T2, Lisbeyond_Wifi, senha2026` — so a cell counts only if the WHOLE
     cell is a label for THAT column, and a cell containing a digit is never a
     label (SSIDs and passwords have digits; column headings do not). */
  var HEADINGS = [
    /^(unit|unit ref\w*|ref\w*|apartment|flat|name|id|unidade|apartamento|imovel|propriedade|fracao|fraccao|casa|nome)$/,
    /^(network|network name|ssid|wifi|wifi name|wifi network|rede|nome da rede|rede wifi)$/,
    /^(password|pass|pwd|passphrase|passcode|key|wifi password|senha|palavra passe|palavra chave|codigo)$/
  ];

  // Folds the accents so the Portuguese headings need only one spelling above.
  function normLabel(s) {
    return String(s).toLowerCase()
      .replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
      .replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ç/g, 'c')
      .replace(/[^a-z]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function looksLikeHeader(r) {
    var hits = 0;
    for (var i = 0; i < 3; i++) {
      var raw = r[i] ? r[i].v.trim() : '';
      if (!raw || /\d/.test(raw)) continue;
      if (HEADINGS[i].test(normLabel(raw))) hits++;
    }
    return hits >= 2;
  }

  // Columns 4 and 5 are optional and rarely used, but honouring them costs
  // nothing and saves a hand-edit when a unit really is WEP or hidden.
  function rowToUnit(r) {
    var extra = (r[3] ? r[3].v : '').trim().toLowerCase();
    var auth = 'WPA';
    if (/^(nopass|open|none|aberta?|aberto|sem)/.test(extra)) auth = 'nopass';
    else if (/^wep/.test(extra)) auth = 'WEP';
    var h = (r[4] ? r[4].v : '').trim().toLowerCase();
    return {
      ref: cell(r[0]), ssid: cell(r[1]), pass: cell(r[2]), auth: auth,
      hidden: /^(1|y|yes|true|sim|hidden|ocult[ao])$/.test(h)
    };
  }

  function refKey(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

  function buildPlan() {
    var text = csvEl.value;
    if (!text.trim()) return null;

    var delim = sniffDelim(text);
    var rows = parseDelimited(text, delim);
    // No row-count guard here: a paste of the header alone should come out empty
    // rather than turn the word "Network" into a card.
    var header = rows.length > 0 && looksLikeHeader(rows[0]);
    if (header) rows = rows.slice(1);

    var mode = document.querySelector('input[name="bulk-mode"]:checked').value;
    // In merge mode a reference can only match a unit that was already there, so
    // the index is built once, before anything is appended.
    var index = {};
    if (mode === 'merge') {
      units.forEach(function (u, i) {
        var k = refKey(u.ref);
        if (k && !(k in index)) index[k] = i;
      });
    }

    var items = [], seenRef = {}, kept = 0, updated = 0, skipped = 0;
    rows.forEach(function (r, i) {
      var u = rowToUnit(r);
      var it = { line: i + 1 + (header ? 1 : 0), u: u, notes: [] };

      if (!u.ssid) {
        it.action = 'skip';
        it.notes.push(r.length < 2
          ? 'only one column on this line — check the separator'
          : 'no network name');
        skipped++;
      } else {
        var k = refKey(u.ref);
        if (mode === 'merge' && k && (k in index)) { it.action = 'update'; it.at = index[k]; updated++; }
        else { it.action = 'add'; kept++; }

        if (u.auth !== 'nopass' && !u.pass) it.notes.push('no password');
        else if (u.auth === 'WPA' && u.pass.length < 8) it.notes.push('WPA password under 8 characters');
        if (k && seenRef[k]) it.notes.push('reference repeats line ' + seenRef[k]);
        else if (k) seenRef[k] = it.line;
        if (r.length > 5) it.notes.push('extra columns after column 5 ignored');
      }
      items.push(it);
    });

    return {
      mode: mode, delim: delim, header: header, items: items,
      added: kept, updated: updated, skipped: skipped
    };
  }

  function delimName(d) { return d === '\t' ? 'tabs' : d === ';' ? 'semicolons' : 'commas'; }

  function refreshBulk() {
    plan = buildPlan();
    bulkPreviewEl.innerHTML = '';

    if (!plan) {
      bulkStatusEl.className = 'status';
      bulkStatusEl.textContent = 'Paste your rows above to see what will happen.';
      bulkApplyEl.disabled = true;
      return;
    }

    var usable = plan.added + plan.updated;
    var bits = [];
    if (plan.mode === 'replace') {
      var now = units.filter(function (u) { return u.ref || u.ssid || u.pass; }).length;
      var n = '<b>' + usable + '</b> unit' + (usable === 1 ? '' : 's');
      bits.push(now ? n + ' will replace the <b>' + now + '</b> now in the list'
                    : n + ' will become the list');
    } else {
      if (plan.updated) bits.push('<b>' + plan.updated + '</b> updated');
      bits.push('<b>' + plan.added + '</b> added');
    }
    if (plan.skipped) bits.push('<b>' + plan.skipped + '</b> skipped');
    bits.push('read as ' + delimName(plan.delim) + (plan.header ? ', header line skipped' : ''));

    bulkStatusEl.className = 'status ' + (!usable ? 'err' : plan.skipped ? 'warn' : 'ok');
    bulkStatusEl.innerHTML = usable ? bits.join(' · ')
      : !plan.items.length
        ? 'That is just the header line — paste the unit rows underneath it.'
        : 'Nothing usable found — every line is missing a network name. ' +
          'Check that the columns are <b>reference, network, password</b>, and that ' +
          'the separator is a comma, a semicolon or a tab.';
    bulkApplyEl.disabled = !usable;

    var html = '<table class="preview"><thead><tr><th>Line</th><th>Unit reference</th>' +
      '<th>Network</th><th>Password</th><th>Security</th><th></th></tr></thead><tbody>';
    plan.items.forEach(function (it) {
      var tag = it.action === 'skip' ? '<span class="tag skip">Skipped</span>'
        : it.action === 'update' ? '<span class="tag upd">Update</span>'
        : plan.mode === 'replace' ? '<span class="tag">Card</span>'
        : '<span class="tag new">New</span>';
      html += '<tr><td class="n">' + it.line + '</td>' +
        '<td>' + (esc(it.u.ref) || '<span class="why">—</span>') + '</td>' +
        '<td class="m">' + esc(it.u.ssid) + '</td>' +
        '<td class="m">' + (it.u.auth === 'nopass' ? '<span class="why">open</span>' : esc(it.u.pass)) + '</td>' +
        '<td>' + (it.u.auth === 'WPA' ? 'WPA/2/3' : it.u.auth === 'WEP' ? 'WEP' : 'Open') +
          (it.u.hidden ? ' · hidden' : '') + '</td>' +
        '<td>' + tag + (it.notes.length ? '<span class="why">' + esc(it.notes.join(' · ')) + '</span>' : '') +
        '</td></tr>';
    });
    bulkPreviewEl.innerHTML = html + '</tbody></table>';
  }

  function applyBulk() {
    if (!plan || !(plan.added + plan.updated)) return;
    var fresh = plan.items.filter(function (it) { return it.action !== 'skip'; });

    if (plan.mode === 'replace') {
      units = fresh.map(function (it) { return it.u; });
    } else {
      fresh.forEach(function (it) {
        if (it.action === 'update') units[it.at] = it.u;
        else units.push(it.u);
      });
      // A single untouched blank starter row is noise once real rows arrive.
      units = units.filter(function (u) { return u.ref || u.ssid || u.pass; });
    }
    if (!units.length) units = [blank()];

    var msg = plan.mode === 'replace'
      ? 'Replaced the list with ' + fresh.length + ' unit' + (fresh.length === 1 ? '' : 's') + '.'
      : (plan.updated ? 'Updated ' + plan.updated + ', ' : '') + 'added ' + plan.added + '.';
    if (plan.skipped) msg += ' ' + plan.skipped + ' line' + (plan.skipped === 1 ? '' : 's') +
      ' skipped for having no network name.';

    save(); drawRows(); render();
    bulkStatusEl.className = 'status ok';
    bulkStatusEl.textContent = msg + ' Check the warnings under the table before printing.';
    bulkPreviewEl.innerHTML = '';
    bulkApplyEl.disabled = true;
    plan = null;
  }

  function csvField(s) {
    s = String(s == null ? '' : s);
    return /[",;\t\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function listAsCsv() {
    var lines = ['Unit reference,Network name,Password,Security,Hidden'];
    units.forEach(function (u) {
      if (!(u.ref || u.ssid || u.pass)) return;
      lines.push([u.ref, u.ssid, u.pass, u.auth === 'WPA' ? 'WPA' : u.auth,
        u.hidden ? 'yes' : ''].map(csvField).join(','));
    });
    return lines.join('\n');
  }

  function refreshCount() {
    var n = units.filter(function (u) { return u.ssid.trim(); }).length;
    countEl.textContent = n ? n + (n === 1 ? ' card' : ' cards') : '';
  }

  // ---- wiring -------------------------------------------------------------
  document.getElementById('add').addEventListener('click', function () {
    units.push(blank()); save(); drawRows(); render();
  });
  document.getElementById('clear').addEventListener('click', function () {
    if (!confirm('Remove every unit from the list?')) return;
    units = [blank()]; save(); drawRows(); render();
  });
  document.getElementById('print').addEventListener('click', function () { window.print(); });

  document.getElementById('bulk-open').addEventListener('click', function () {
    bulkEl.hidden = !bulkEl.hidden;
    if (!bulkEl.hidden) { refreshBulk(); csvEl.focus(); }
  });
  document.getElementById('bulk-close').addEventListener('click', function () { bulkEl.hidden = true; });
  document.getElementById('bulk-example').addEventListener('click', function () {
    csvEl.value = EXAMPLE; refreshBulk(); csvEl.focus();
  });
  document.getElementById('bulk-copy').addEventListener('click', function (e) {
    var text = listAsCsv(), btn = e.currentTarget, label = btn.textContent;
    function done(ok) {
      btn.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(function () { btn.textContent = label; }, 1600);
    }
    /* A file:// page is not a secure context in every browser, so the async
       clipboard can reject. Fall back through a throwaway textarea rather than
       the real one — writing into the box would destroy a paste in progress. */
    function fallback() {
      var t = document.createElement('textarea');
      t.value = text;
      t.setAttribute('style', 'position:fixed;top:-1000px;left:0;opacity:0');
      document.body.appendChild(t);
      t.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      document.body.removeChild(t);
      csvEl.focus();
      done(ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    } else fallback();
  });
  csvEl.addEventListener('input', refreshBulk);
  Array.prototype.forEach.call(document.querySelectorAll('input[name="bulk-mode"]'), function (r) {
    r.addEventListener('change', refreshBulk);
  });
  bulkApplyEl.addEventListener('click', applyBulk);
  optRef.addEventListener('change', function () { save(); render(); });
  optPayload.addEventListener('change', function () { save(); render(); });
  optDesign.addEventListener('change', function () { save(); render(); });

  drawRows();
  render();
})();
