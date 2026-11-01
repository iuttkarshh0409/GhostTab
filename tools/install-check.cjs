// Installs the NSIS installer silently and probes the result.
// Usage: node tools/install-check.cjs
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SETUP = path.join(
  require('os').homedir(),
  'ghosttab-target', 'release', 'bundle', 'nsis',
  'GhostTab_1.0.0_x64-setup.exe',
);

const candidates = [
  path.join(process.env.ProgramFiles || 'C:/Program Files', 'GhostTab', 'ghosttab.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'GhostTab', 'ghosttab.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'GhostTab', 'ghosttab.exe'),
];

async function main() {
  console.log('setup exists:', fs.existsSync(SETUP), SETUP);
  const child = spawn(SETUP, ['/S'], { detached: false, stdio: 'ignore' });
  console.log('spawned installer pid:', child.pid);

  await new Promise((r) => child.on('exit', r));
  console.log('installer exited, code:', child.exitCode);

  // Wait for file placement to settle.
  await new Promise((r) => setTimeout(r, 5000));

  for (const c of candidates) {
    console.log(c, '=>', fs.existsSync(c) ? 'EXISTS' : 'missing');
  }
  process.exit(0);
}
main();
