import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, readdirSync } from 'fs';

const target = process.env.TARGET === 'firefox' ? 'firefox' : 'chrome';
const outDir = target === 'firefox' ? 'dist-firefox' : 'dist';
const manifestSrc = target === 'firefox' ? 'manifest.firefox.json' : 'manifest.json';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-static',
      closeBundle() {
        copyFileSync(manifestSrc, `${outDir}/manifest.json`);
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
        '**/*.d.ts',
        '**/worktrees/**',
      ],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 88,
        statements: 95,
      },
    },
  },
});
