import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';

const target = process.env.TARGET === 'firefox' ? 'firefox' : 'chrome';
const outDir = target === 'firefox' ? 'dist-firefox' : 'dist';
const manifestSrc = target === 'firefox' ? 'manifest.firefox.json' : 'manifest.json';
// `key` pins the dev-mode extension ID for OAuth redirect URIs. The Chrome
// Web Store rejects it ("key field is not allowed in manifest"), so strip it
// from production builds (STORE=1) — dev builds keep it for stable IDs.
const stripKey = process.env.STORE === '1';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-static',
      closeBundle() {
        const manifest = JSON.parse(readFileSync(manifestSrc, 'utf8'));
        if (stripKey) delete manifest.key;
        writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
        mkdirSync(`${outDir}/icons`, { recursive: true });
        for (const name of readdirSync('icons')) {
          if (name.endsWith('.png')) copyFileSync(`icons/${name}`, `${outDir}/icons/${name}`);
        }
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
    outDir,
    emptyOutDir: true,
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/worktrees/**',
      '**/.claude/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/popup/main.tsx',
        'src/background/service-worker.ts',
        'src/core/constants.ts',
        // pure type declarations — no runtime to cover; REVISIT if any const/enum/fn is added here
        'src/core/types.ts',
        '**/*.d.ts',
        '**/worktrees/**',
      ],
      // Calibrated 2026-05-30 against @vitest/coverage-v8 3's AST-aware remap
      // (COVERAGE-1). v8 3 measures the same source more strictly than v8 1 did,
      // so these are the honest measured floors (set at/just below the real
      // globals), NOT a relaxed bar — `branches` is unchanged. If `test:coverage`
      // is ever promoted to a required CI check, RE-DERIVE these, don't inherit.
      // Re-measure before lowering.
      thresholds: {
        lines: 92,
        functions: 88,
        branches: 88,
        statements: 92,
      },
    },
  },
});
