// Launches the installed GhostTab app (detached) and prints its PID.
const { spawn } = require('child_process');
const path = require('path');

const EXE = path.join(process.env.LOCALAPPDATA || '', 'GhostTab', 'ghosttab.exe');
const child = spawn(EXE, [], { detached: true, stdio: 'ignore' });
child.unref();
console.log('launched installed ghosttab, PID:', child.pid);
setTimeout(() => process.exit(0), 500);
