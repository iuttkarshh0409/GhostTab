// Shared resolver — NOTE: this environment cannot require() local sibling files,
// so this module is not imported (see git-*.cjs which inline the same logic).
// Kept for reference/documentation.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function isGitRepo(dir) {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

function resolveRepoPath() {
  const fromArg = process.argv[2];
  if (fromArg && fs.existsSync(fromArg)) return path.resolve(fromArg);

  const fromEnv = process.env.GHOSTTAB_REPO;
  if (fromEnv && fs.existsSync(fromEnv)) return path.resolve(fromEnv);

  if (isGitRepo(process.cwd())) return process.cwd();

  const err = new Error('Could not resolve GhostTab repo path. Pass it as the first argument or set GHOSTTAB_REPO, or run from inside the repo.');
  err.code = 'NO_REPO';
  throw err;
}

module.exports = { resolveRepoPath, isGitRepo };
