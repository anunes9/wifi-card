/* These are the failure modes that produce a card nobody can use: a QR that
   scans into the wrong credentials, or one too dense to read off paper. */
import { encode, wifiPayload } from './qr';
import type { UnitData, Warning } from './types';

export function checkAll(list: UnitData[]): Warning[] {
  const out: Warning[] = [];
  const seen: Record<string, string> = {};

  for (const u of list) {
    const who = u.ref ? '"' + u.ref + '"' : 'network "' + u.ssid + '"';

    if (u.auth !== 'nopass' && !u.pass) {
      out.push({ err: true, msg: who + ' has no password. Set one, or switch it to "Open, no password".' });
    }
    if (u.auth === 'WPA' && u.pass && u.pass.length < 8) {
      out.push({ err: true, msg: who + ': a WPA password must be at least 8 characters — phones will refuse to join.' });
    }
    if (/^\s|\s$/.test(u.ssid) || /^\s|\s$/.test(u.pass)) {
      out.push({ err: true, msg: who + ' starts or ends with a space. That is almost always a typo, and it will not join.' });
    }

    const key = JSON.stringify([u.ssid, u.pass]);
    if (seen[key]) out.push({ msg: who + ' repeats the same network and password as ' + seen[key] + '.' });
    else seen[key] = who;

    const payload = wifiPayload({ ssid: u.ssid, password: u.pass, auth: u.auth, hidden: u.hidden });
    try {
      const qr = encode(payload, { ecl: 'Q' });
      if (qr.version >= 10) {
        out.push({
          msg: who + ' makes a dense QR (version ' + qr.version +
            '). It still scans, but a shorter password prints more reliably.',
        });
      }
    } catch (e) {
      out.push({ err: true, msg: who + ': ' + (e instanceof Error ? e.message : String(e)) });
    }

    if (/[^\x20-\x7E]/.test(u.ssid + u.pass)) {
      out.push({
        msg: who + ' contains accented or non-English characters. They are encoded correctly, ' +
          'but a few older Android scanners mis-read them — worth testing one card.',
      });
    }
  }

  return out;
}
