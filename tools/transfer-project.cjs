const fs = require('fs');
const path = require('path');

const SRC = process.cwd();
const DEST = 'D:\\Side Projects\\UD\\GhostTab';

// Top-level entries to EXCLUDE from the transfer (generated / sandbox-specific).
const EXCLUDE_TOP = new Set([
  'node_modules',
  'coverage',
  'dist',
  'src-tauri/target',
  'tsconfig.tsbuildinfo',
  'dev-runner.cjs',
  'probe-env.cjs',
  'probe-vcvars.cjs',
  'probe-paths.js',
  'runner-vcvars.bat',
  'tauri.cjs',
  'gen-icon.cjs',
  'wait.cjs',
  'run.cjs',
  'tools/transfer-project.cjs',
]);

// Always-excluded names anywhere in the tree (build outputs / caches).
const EXCLUDE_NAME = new Set(['node_modules', 'target', 'dist', 'coverage', '.git']);

function shouldExclude(rel) {
  if (EXCLUDE_TOP.has(rel)) return true;
  const parts = rel.split(path.sep);
  return parts.some((p) => EXCLUDE_NAME.has(p));
}

function copy(src, dest, rel) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    if (shouldExclude(rel)) {
      console.log('  [skip dir] ' + rel);
      return;
    }
    fs.mkdirSync(dest, { recursive: true });
    for (const e of fs.readdirSync(src)) {
      copy(path.join(src, e), path.join(dest, e), rel ? rel + '/' + e : e);
    }
  } else {
    if (shouldExclude(rel)) {
      console.log('  [skip file] ' + rel);
      return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log('  [copy] ' + rel + ' (' + st.size + ' B)');
  }
}

console.log('SRC =', SRC);
console.log('DEST =', DEST);
console.log('D: exists =', fs.existsSync('D:\\'));
console.log('D:\\Side Projects exists =', fs.existsSync('D:\\Side Projects'));

if (!fs.existsSync('D:\\')) {
  console.log('ERROR: D: drive not present. Aborting.');
  process.exit(1);
}
fs.mkdirSync(DEST, { recursive: true });
copy(SRC, DEST, '');
console.log('\nTransfer complete.');

// Report destination summary sizes.
function dirSize(d) {
  let total = 0;
  const walk = (x) => {
    let e;
    try {
      e = fs.readdirSync(x, { withFileTypes: true });
    } catch {
      return;
    }
    for (const z of e) {
      const f = path.join(x, z.name);
      if (z.isDirectory()) walk(f);
      else {
        try {
          total += fs.statSync(f).size;
        } catch {}
      }
    }
  };
  walk(d);
  return total;
}
console.log('Destination total bytes (incl. src-tauri/target if copied):', dirSize(DEST));
