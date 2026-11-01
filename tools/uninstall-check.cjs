const { spawn } = require('child_process');
const path = require('path');

const UNINSTALL = path.join(process.env.LOCALAPPDATA || '', 'GhostTab', 'uninstall.exe');
const appDir = path.join(process.env.LOCALAPPDATA || '', 'GhostTab');
const userData = path.join(process.env.LOCALAPPDATA || '', 'com.ghosttab.app');

const fs = require('fs');

function hasAnyFiles(dir) {
  if (!fs.existsSync(dir)) return false;
  let n = 0;
  const walk = (d, depth) => {
    if (depth <= 0) return;
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      n++;
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f, depth - 1);
    }
  };
  walk(dir, 3);
  return n > 0;
}

console.log('uninstall.exe exists:', fs.existsSync(UNINSTALL));

const child = spawn(UNINSTALL, ['/S'], { stdio: 'ignore' });
child.on('exit', (code) => {
  console.log('uninstaller exited code:', code);
  setTimeout(() => {
    console.log('install dir exists:', fs.existsSync(appDir), appDir);
    console.log('user data dir exists:', fs.existsSync(userData), userData);
    console.log('user data retains files:', hasAnyFiles(userData));
    process.exit(0);
  }, 5000);
});
