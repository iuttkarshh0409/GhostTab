const fs = require('fs');
const path = require('path');

const DEST = 'D:\\Side Projects\\UD\\GhostTab';
function list(dir, depth) {
  if (depth <= 0) return;
  let e;
  try {
    e = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    console.log('  !! cannot read', dir, err.message);
    return;
  }
  for (const x of e) {
    const full = path.join(dir, x.name);
    const rel = path.relative(DEST, full);
    if (x.isDirectory()) {
      console.log('[dir] ' + rel);
      list(full, depth - 1);
    } else {
      console.log('[file] ' + rel + '  ' + fs.statSync(full).size + ' B');
    }
  }
}
console.log('DEST exists:', fs.existsSync(DEST));
console.log('Contains node_modules:', fs.existsSync(path.join(DEST, 'node_modules')));
console.log('Contains dist:', fs.existsSync(path.join(DEST, 'dist')));
console.log('Contains src-tauri/target:', fs.existsSync(path.join(DEST, 'src-tauri', 'target')));
console.log('Contains package.json:', fs.existsSync(path.join(DEST, 'package.json')));
console.log('Contains src/:', fs.existsSync(path.join(DEST, 'src')));
console.log('Contains tests/:', fs.existsSync(path.join(DEST, 'tests')));
console.log('\n--- tree (depth 2) ---');
list(DEST, 2);
