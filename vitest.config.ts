import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // lib/ imports relatively; the alias is for the components the skill renders.
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: { include: ['lib/**/*.test.ts', 'skill/**/*.test.ts'], environment: 'node' },
});
