/* Packages the Claude skill, and the same skill wrapped as a plugin:
     dist/skill/wifi-cards/, zipped to dist/wifi-cards.zip (a skill upload)
     dist/plugin/, zipped to dist/wifi-cards-plugin.zip (Customize → Plugins →
       Add → Upload plugin), which is .claude-plugin/plugin.json plus
       skills/wifi-cards/ holding the skill below.

     wifi-cards/
       SKILL.md
       scripts/wificards.mjs   the CLI with React bundled in, so it runs on bare Node
       assets/cards.css        app/globals.css, as is
       assets/fonts/, assets/img/   public/, as is */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'rolldown';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const out = join(dist, 'skill', 'wifi-cards');

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(out, 'assets'), { recursive: true });

await build({
  input: join(root, 'skill', 'cli.ts'),
  platform: 'node',
  resolve: { alias: { '@': root } },
  transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': '"production"' } },
  output: { file: join(out, 'scripts', 'wificards.mjs'), format: 'esm', minify: true },
  logLevel: 'warn',
});

cpSync(join(root, 'skill', 'SKILL.md'), join(out, 'SKILL.md'));
cpSync(join(root, 'app', 'globals.css'), join(out, 'assets', 'cards.css'));
cpSync(join(root, 'public', 'fonts'), join(out, 'assets', 'fonts'), { recursive: true });
cpSync(join(root, 'public', 'img'), join(out, 'assets', 'img'), { recursive: true });

execFileSync('zip', ['-qr', join(dist, 'wifi-cards.zip'), 'wifi-cards'], { cwd: join(dist, 'skill') });

const plugin = join(dist, 'plugin');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
mkdirSync(join(plugin, '.claude-plugin'), { recursive: true });
writeFileSync(join(plugin, '.claude-plugin', 'plugin.json'), JSON.stringify({
  name: 'wifi-cards',
  version,
  description: "Lisbeyond's printable WiFi cards, with a QR code that joins the network, from a CSV of apartments.",
  author: { name: 'Lisbeyond Ops' },
}, null, 2) + '\n');
cpSync(out, join(plugin, 'skills', 'wifi-cards'), { recursive: true });
// The plugin's own files sit at the root of its zip, .claude-plugin/ included.
execFileSync('zip', ['-qr', join(dist, 'wifi-cards-plugin.zip'), '.'], { cwd: plugin });

console.log('Built dist/wifi-cards.zip (skill) and dist/wifi-cards-plugin.zip (plugin)');
