const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEST = 'D:/Side Projects/UD/GhostTab';

function run(args) {
  try {
    const out = execFileSync('git', ['-C', DEST, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, out: out.trim() };
  } catch (e) {
    return { ok: false, out: (e.stderr || e.message).trim() };
  }
}

console.log('DEST exists:', fs.existsSync(DEST));
console.log('DEST/.git exists:', fs.existsSync(path.join(DEST, '.git')));

// Walk up from DEST looking for a .git
let cur = path.resolve('D:/Side Projects/UD/GhostTab');
console.log('\nAncestor .git search:');
for (let i = 0; i < 6; i++) {
  const g = path.join(cur, '.git');
  console.log('  ', cur, '-> .git', fs.existsSync(g));
  const parent = path.dirname(cur);
  if (parent === cur) break;
  cur = parent;
}

console.log('\ngit rev-parse --show-toplevel:', JSON.stringify(run(['rev-parse', '--show-toplevel'])));
console.log('git rev-parse --is-inside-work-tree:', JSON.stringify(run(['rev-parse', '--is-inside-work-tree'])));
