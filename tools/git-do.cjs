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
  if (process.env.GHOSTTAB_REPO && fs.existsSync(process.env.GHOSTTAB_REPO)) return path.resolve(process.env.GHOSTTAB_REPO);
  if (isGitRepo(process.cwd())) return process.cwd();
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'repo-config.json'), 'utf8'));
    if (cfg.repoPath && fs.existsSync(cfg.repoPath)) return path.resolve(cfg.repoPath);
  } catch {}
  throw new Error('Could not resolve repo path');
}
const DEST = resolveRepoPath();
const args = process.argv.slice(2);

try {
  const out = execFileSync('git', ['-C', DEST, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  process.stdout.write(out);
} catch (e) {
  process.stderr.write(e.stderr || e.message);
  process.exit(e.status || 1);
}
