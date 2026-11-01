const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function isGitRepo(dir) {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}
function resolveRepoPath() {
  if (process.argv[2] && fs.existsSync(process.argv[2])) return path.resolve(process.argv[2]);
  if (process.env.GHOSTTAB_REPO && fs.existsSync(process.env.GHOSTTAB_REPO)) return path.resolve(process.env.GHOSTTAB_REPO);
  if (isGitRepo(process.cwd())) return process.cwd();
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'repo-config.json'), 'utf8'));
    if (cfg.repoPath && fs.existsSync(cfg.repoPath)) return path.resolve(cfg.repoPath);
  } catch {}
  throw new Error('Could not resolve repo path');
}
const DEST = resolveRepoPath();

function run(args) {
  try {
    const out = execFileSync('git', ['-C', DEST, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out: out.trim() };
  } catch (e) {
    return { ok: false, out: (e.stderr || e.message).trim() };
  }
}

console.log('== repo ==');
console.log(DEST);
console.log('== branch ==');
console.log(run(['branch', '--show-current']).out);
console.log('== log -1 ==');
console.log(run(['log', '-1', '--oneline', '--decorate']).out);
console.log('== remote -v ==');
console.log(run(['remote', '-v']).out);
console.log('== status --short (porcelain) ==');
console.log(run(['status', '--porcelain']).out || '(clean)');
console.log('== rev-parse HEAD ==');
console.log(run(['rev-parse', 'HEAD']).out);
