/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Three build targets:
//   default  →  static SPA (Netlify-deployable demo)
//   --mode lib → npm package (React component)
//   --mode wc  → standalone <liquid-qv> Web Component bundle
//
// VITE_BASE_PATH lets Netlify deploy at "/" and a subpath like
// "/tools/liquid-qv/" without code changes.
//
// Test config is colocated here so vitest and vite share one resolved
// Vite (avoiding duplicate-package type-mismatch headaches).
export default defineConfig(({ mode }) => {
  const base = process.env.VITE_BASE_PATH ?? '/';

  if (mode === 'lib') {
    // Declaration files are emitted by `tsc -p tsconfig.lib.json` after
    // this build runs (see package.json build:lib script). Doing it via
    // tsc directly avoids the dual-Vite type confusion we'd otherwise
    // hit through vite-plugin-dts.
    return {
      plugins: [react()],
      build: {
        outDir: 'dist-lib',
        emptyOutDir: true,
        sourcemap: true,
        copyPublicDir: false,
        lib: {
          entry: resolve(__dirname, 'src/lib/index.ts'),
          name: 'LiquidQV',
          fileName: (format) => (format === 'es' ? 'liquid-qv.js' : 'liquid-qv.umd.cjs'),
          formats: ['es', 'umd'],
        },
        rollupOptions: {
          external: ['react', 'react-dom', 'react/jsx-runtime'],
          output: {
            globals: {
              react: 'React',
              'react-dom': 'ReactDOM',
              'react/jsx-runtime': 'jsxRuntime',
            },
          },
        },
      },
    };
  }

  if (mode === 'wc') {
    return {
      plugins: [react()],
      define: {
        // Web Component build is fully self-contained: bundle React in.
        'process.env.NODE_ENV': JSON.stringify('production'),
      },
      build: {
        outDir: 'dist-wc',
        emptyOutDir: true,
        sourcemap: true,
        copyPublicDir: false,
        lib: {
          entry: resolve(__dirname, 'src/wc/index.tsx'),
          name: 'LiquidQVElement',
          fileName: () => 'liquid-qv.wc.js',
          formats: ['iife'],
        },
      },
    };
  }

  return {
    base,
    plugins: [react()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
    },
    test: {
      environment: 'happy-dom',
      globals: true,
      setupFiles: ['./src/test-setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
