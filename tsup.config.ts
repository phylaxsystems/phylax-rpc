import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    react: 'src/react.ts',
    wagmi: 'src/wagmi.ts',
    viem: 'src/viem.ts',
    ethers: 'src/ethers.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
  // React stays a peer dependency; never bundle it.
  external: ['react'],
});
