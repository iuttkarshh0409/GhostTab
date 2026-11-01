const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'repo-config.json');
const DEST = 'D:/Side Projects/UD/GhostTab/tools/repo-config.json';
fs.copyFileSync(SRC, DEST);
console.log('copied config to', DEST);

// Append ignore rule if not already present.
const GI = 'D:/Side Projects/UD/GhostTab/.gitignore';
let g = fs.readFileSync(GI, 'utf8');
if (!/tools\/repo-config\.json/.test(g)) {
  g += '\n# local git helper config (machine-specific)\ntools/repo-config.json\n';
  fs.writeFileSync(GI, g, 'utf8');
  console.log('updated .gitignore');
} else {
  console.log('.gitignore already covers repo-config.json');
}
