const fs = require('fs');
const path = require('path');

const README = 'D:\\Side Projects\\UD\\GhostTab\\README.md';
if (!fs.existsSync(README)) {
  console.error('README not found:', README);
  process.exit(1);
}

const fence = '```';
const section = `
### Quick start (fresh copy / transferred repo)

Run these from the project root (\`cd "D:\\Side Projects\\UD\\GhostTab"\`):

${fence}bash
npm install            # restore dependencies (node_modules is not versioned)
npm test               # full test suite (expect 92 passing)
npx tsc --noEmit      # TypeScript type-check

npm run build          # frontend production build -> dist/
npm run dev            # Vite dev server -> http://localhost:5173

npm run tauri:dev     # desktop app (dev): frontend Vite + Rust shell
npm run tauri:build   # production build -> NSIS installer
${fence}

Tauri production outputs:

- Installer: \`src-tauri/target/release/bundle/nsis/GhostTab_1.0.0_x64-setup.exe\`
- Binary: \`src-tauri/target/release/ghosttab.exe\`

Notes:

- First \`npm run tauri:build\` compiles all Rust dependencies (takes a few minutes).
- The runtime WebView2 user-data lives under \`%LOCALAPPDATA%\\com.ghosttab.app\`
  (identifier-keyed) and persists independently of the install directory.
- No sandbox/runner helper scripts are part of the transferred repo; the standard
  npm scripts above are the intended entry points.
`;

let md = fs.readFileSync(README, 'utf8');

// Insert before the next top-level section after the Setup block.
const anchor = '\n## Analytics (Round 2)';
if (!md.includes(anchor)) {
  console.error('Anchor not found in destination README; aborting.');
  process.exit(1);
}
if (!md.includes('Quick start (fresh copy')) {
  md = md.replace(anchor, section + '\n' + anchor.slice(1));
  fs.writeFileSync(README, md, 'utf8');
  console.log('Updated', README);
} else {
  console.log('Section already present; no change.');
}
console.log('New length chars:', md.length);
