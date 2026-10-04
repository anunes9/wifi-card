import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Card images are sized in mm for print, and a static export has no image
      // optimiser, so next/image buys nothing here.
      '@next/next/no-img-element': 'off',
    },
  },
  // js/ and dist/ are the legacy app, kept as the reference until the migration ends.
  globalIgnores(['.next/**', 'out/**', 'next-env.d.ts', 'js/**', 'dist/**']),
]);
