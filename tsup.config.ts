import { defineConfig } from 'tsup';

const shared = {
  format: ['esm'] as const,
  dts: true,
  treeshake: true,
  sourcemap: false,
  // Inline the small logo artwork. Walkthrough images are served by Cloudflare Images.
  loader: {
    '.svg': 'dataurl' as const,
  },
  // React stays a peer dependency; never bundle it.
  external: ['react'],
};

export default defineConfig([
  {
    ...shared,
    // Owns `clean` so it wipes dist once, before either config writes to it.
    clean: true,
    entry: {
      index: 'src/index.ts',
      advanced: 'src/advanced.ts',
      wagmi: 'src/wagmi.ts',
      viem: 'src/viem.ts',
      ethers: 'src/ethers.ts',
    },
  },
  {
    ...shared,
    clean: false,
    // Only the React entry pulls in hooks/ManualAddModal, so it's the only one that
    // needs the client boundary for Next.js App Router (RSC) consumers.
    entry: { react: 'src/react.ts' },
    banner: { js: '"use client";' },
    // tsup's optional rollup treeshake pass strips module-level directives (and warns);
    // disabling it here keeps the "use client" banner. Consumers' bundlers treeshake anyway.
    treeshake: false,
  },
]);
