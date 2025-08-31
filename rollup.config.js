import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

export default {
  input: 'main.js',
  output: {
    file: 'package/lib/aux4-db-sqlite.js',
    format: 'es',
    banner: '#!/usr/bin/env node'
  },
  plugins: [
    nodeResolve({
      preferBuiltins: true,
      browser: false
    }),
    commonjs({
      ignoreDynamicRequires: false,
      dynamicRequireTargets: [
        'node_modules/@libsql/*/index.node',
        'node_modules/@libsql/*/package.json'
      ]
    }),
    json()
  ],
  external: [
    'fs',
    'path',
    'crypto',
    'util',
    'stream',
    'url',
    'events',
    'buffer',
    'process',
    'os',
    'child_process',
    'zlib',
    'tls',
    'net',
    'http',
    'https',
    'querystring',
    'libsql',
    /^@libsql\/.*/,
    /^@neon-rs\/.*/,
    'detect-libc'
  ]
};