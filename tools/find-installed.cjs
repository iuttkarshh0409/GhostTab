const fs = require('fs');
const path = require('path');

const roots = [
  process.env.ProgramFiles || 'C:/Program Files',
  process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)',
  path.join(process.env.LOCALAPPDATA || '', 'Programs'),
  path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
];

const hits = [];

function walk(dir, depth) {
  if (depth <= 0 || !dir) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (/ghost/i.test(e.name)) hits.push('[dir] ' + full);
      walk(full, depth - 1);
    } else {
      const low = e.name.toLowerCase();
      if (/ghost|\.lnk$/.test(low)) hits.push('[file] ' + full);
    }
  }
}

for (const r of roots) {
  console.log('scanning', r);
  walk(r, 4);
}
console.log('\n--- hits ---');
for (const h of hits) console.log(h);
console.log('total hits:', hits.length);
