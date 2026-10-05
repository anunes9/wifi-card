/* Packages the Claude skill: dist/skill/wifi-cards/ and dist/wifi-cards.zip,
   the zip being what you upload in Claude (Settings → Capabilities → Skills).

     wifi-cards/
       SKILL.md
       scripts/wificards.mjs   the CLI with React bundled in, so it runs on bare Node
       assets/cards.css        app/globals.css, as is
       assets/fonts/, assets/img/   public/, as is */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
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
console.log('Built dist/skill/wifi-cards/ and dist/wifi-cards.zip');
