const fs = require('fs');
const path = require('path');

const root = process.env.LOCALAPPDATA || '';
console.log('scanning', root);

function walk(dir, depth, out) {
  if (depth <= 0) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const low = e.name.toLowerCase();
    if (/ghost|ghosttab/.test(low)) {
      out.push(full);
    }
    if (e.isDirectory()) walk(full, depth - 1, out);
  }
}

const out = [];
walk(root, 3, out);
console.log('GhostTab-related paths under LOCALAPPDATA:');
for (const p of out) console.log('  ' + p);
console.log('count:', out.length);
