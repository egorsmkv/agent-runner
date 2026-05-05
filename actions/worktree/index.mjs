import { spawn } from 'node:child_process';
import { lstat, mkdir, readlink, stat, symlink } from 'node:fs/promises';
import path from 'node:path';

import { planSlugForPrd } from '../plan/index.mjs';

export function resolveAgentWorktree({ repoRoot, prdPath, scopeId = null }) {
  const slug = planSlugForPrd(prdPath);

  return {
    slug,
    branch: scopeId ? `agent/${slug}-${scopeId}` : `agent/${slug}`,
    worktreeRoot: scopeId
      ? path.join(repoRoot, '.agent', 'worktrees', 'scopes', slug, scopeId)
      : path.join(repoRoot, '.agent', 'worktrees', slug),
  };
}

export async function ensureAgentWorktree({
  repoRoot,
  prdPath,
  scopeId = null,
  log = console.log,
}) {
  const worktree = resolveAgentWorktree({ repoRoot, prdPath, scopeId });

  if (await isGitWorktree(worktree.worktreeRoot)) {
    await syncCleanWorktreeToParentHead({
      repoRoot,
      worktreeRoot: worktree.worktreeRoot,
      log,
    });
    await ensureWorktreeNodeTooling({ repoRoot, worktreeRoot: worktree.worktreeRoot });
    log.stage?.('Agent worktree', [
      ['path', path.relative(repoRoot, worktree.worktreeRoot)],
      ['branch', worktree.branch],
      ['mode', 'reuse'],
    ]);
    return worktree;
  }

  if (scopeId) {
    const legacyRoot = path.join(repoRoot, '.agent', 'worktrees', worktree.slug, scopeId);

    if (await isGitWorktree(legacyRoot)) {
      await mkdir(path.dirname(worktree.worktreeRoot), { recursive: true });
      await runGit(repoRoot, ['worktree', 'move', legacyRoot, worktree.worktreeRoot]);
      await ensureWorktreeNodeTooling({ repoRoot, worktreeRoot: worktree.worktreeRoot });
      log.stage?.('Agent worktree', [
        ['path', path.relative(repoRoot, worktree.worktreeRoot)],
        ['branch', worktree.branch],
        ['mode', 'migrated legacy scope path'],
      ]);
      return worktree;
    }
  }

  await mkdir(path.dirname(worktree.worktreeRoot), { recursive: true });
  const branchExists = await gitBranchExists(repoRoot, worktree.branch);
  const args = branchExists
    ? ['worktree', 'add', worktree.worktreeRoot, worktree.branch]
    : ['worktree', 'add', '-b', worktree.branch, worktree.worktreeRoot, 'HEAD'];

  await runGit(repoRoot, args);
  await ensureWorktreeNodeTooling({ repoRoot, worktreeRoot: worktree.worktreeRoot });
  log.stage?.('Agent worktree', [
    ['path', path.relative(repoRoot, worktree.worktreeRoot)],
    ['branch', worktree.branch],
    ['mode', branchExists ? 'attached existing branch' : 'created branch'],
  ]);

  return worktree;
}

async function syncCleanWorktreeToParentHead({ repoRoot, worktreeRoot, log }) {
  const status = (
    await runGit(worktreeRoot, ['status', '--short', '--untracked-files=all'])
  ).stdout.trim();

  if (status) {
    return;
  }

  const parentHead = (await runGit(repoRoot, ['rev-parse', 'HEAD'])).stdout.trim();
  const worktreeHead = (await runGit(worktreeRoot, ['rev-parse', 'HEAD'])).stdout.trim();

  if (parentHead === worktreeHead) {
    return;
  }

  await runGit(worktreeRoot, ['reset', '--hard', parentHead]);
  log(`[git] synced clean agent worktree to parent ${parentHead.slice(0, 7)}`);
}

async function ensureWorktreeNodeTooling({ repoRoot, worktreeRoot }) {
  const rootNodeModules = path.join(repoRoot, 'node_modules');

  if (!(await pathExists(rootNodeModules))) {
    return;
  }

  const worktreeNodeModules = path.join(worktreeRoot, 'node_modules');
  await mkdir(path.join(worktreeNodeModules, '.vite-temp'), { recursive: true });
  await ensureSymlink({
    linkPath: path.join(worktreeNodeModules, '.bin'),
    targetPath: path.join(rootNodeModules, '.bin'),
  });
  await ensureSymlink({
    linkPath: path.join(worktreeNodeModules, 'react'),
    targetPath: path.join(rootNodeModules, 'react'),
  });
  await ensureSymlink({
    linkPath: path.join(worktreeNodeModules, 'react-dom'),
    targetPath: path.join(rootNodeModules, 'react-dom'),
  });
}

async function isGitWorktree(worktreeRoot) {
  try {
    const entry = await stat(worktreeRoot);

    if (!entry.isDirectory()) {
      return false;
    }

    const result = await runGit(worktreeRoot, ['rev-parse', '--is-inside-work-tree']);
    return result.stdout.trim() === 'true';
  } catch {
    return false;
  }
}

async function gitBranchExists(repoRoot, branch) {
  const result = await runGit(
    repoRoot,
    ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
    {
      rejectOnFailure: false,
    },
  );

  return result.exitCode === 0;
}

async function ensureSymlink({ linkPath, targetPath }) {
  if (!(await pathExists(targetPath))) {
    return;
  }

  try {
    const entry = await lstat(linkPath);

    if (!entry.isSymbolicLink()) {
      return;
    }

    const currentTarget = await readlink(linkPath);
    if (path.resolve(path.dirname(linkPath), currentTarget) === targetPath) {
      return;
    }

    return;
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  await symlink(targetPath, linkPath);
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

function runGit(cwd, args, { rejectOnFailure = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      const result = { exitCode: exitCode ?? 1, stdout, stderr };

      if (result.exitCode === 0 || !rejectOnFailure) {
        resolve(result);
        return;
      }

      reject(
        new Error(`git ${args.join(' ')} failed with ${result.exitCode}\n${stderr || stdout}`),
      );
    });
  });
}
