const fs = require('fs');
const path = require('path');

const DEST = path.join('D:\\Side Projects\\UD\\GhostTab', '.gitignore');

const content = `# Node / npm
node_modules/
dist/
coverage/
*.tsbuildinfo
*.log
npm-debug.log*
yarn-error.log*

# Environment
.env
.env.*
!.env.example

# Editor / OS
.vscode/*
!.vscode/extensions.json
.idea/
.DS_Store
Thumbs.db

# Tauri / Rust (src-tauri)
src-tauri/target/
src-tauri/gen/schemas/*
!src-tauri/gen/schemas/*.json
`;

fs.writeFileSync(DEST, content, 'utf8');
console.log('Wrote', DEST);
console.log(content);
