import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

export default {
  input: 'bin/executable.js',
  output: {
    file: 'package/lib/aux4-sqlite.cjs',
    format: 'cjs',
    banner: '#!/usr/bin/env node\n',
    exports: 'none'
  },
  external: ['better-sqlite3'],
  plugins: [
    nodeResolve({
      preferBuiltins: true
    }),
    commonjs(),
    json()
  ]
};