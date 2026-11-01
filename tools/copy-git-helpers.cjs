const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'tools');
const DEST_TOOLS = 'D:/Side Projects/UD/GhostTab/tools';

const files = [
  'git-repo.cjs',
  'git-do.cjs',
  'git-init.cjs',
  'git-add.cjs',
  'git-state.cjs',
  'git-commit-push.cjs',
  'git-push-main.cjs',
  'git-verify.cjs',
];

fs.mkdirSync(DEST_TOOLS, { recursive: true });
for (const f of files) {
  fs.copyFileSync(path.join(SRC, f), path.join(DEST_TOOLS, f));
  console.log('copied', f);
}
console.log('done');
