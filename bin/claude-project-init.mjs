#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const RESOURCES = path.join(ROOT, 'resources');
const MANIFEST_PATH = path.join(RESOURCES, 'manifest.json');
const DEFAULT_EXCLUDES = [
  '**/.state/**',
  '**/__pycache__/**',
  '**/records/**',
  '**/.tmp/**',
  '**/.claude/worktrees/**',
  '**/*.pyc',
  '**/.DS_Store',
];

const GIT_POLICIES = {
  'local-only': {
    label: '本地私用',
    description: '初始化产物只服务当前本地工作区，不建议提交到仓库。',
    excludes: ['/CLAUDE.md', '/.claude/', '/local/'],
    recommendations: [
      { path: 'CLAUDE.md', visibility: 'local', guidance: '本地协作规则；如需公开，请单独整理公开版后再提交。' },
      { path: '.claude/', visibility: 'local', guidance: '本地 Claude Code 工作区状态和安装后的 workspace skills，不建议提交。' },
      { path: 'local/', visibility: 'local', guidance: '本地长期记录和过程资料入口，不建议提交。' },
    ],
  },
  'public-repo': {
    label: '公开仓库',
    description: '公开仓库默认只共享经审查的协作说明，不发布本地技能安装态和长期记录。',
    excludes: ['/.claude/', '/local/'],
    recommendations: [
      { path: 'CLAUDE.md', visibility: 'review', guidance: '可提交公开版，但应先审查是否包含个人偏好、内部流程或不适合外部贡献者的规则。' },
      { path: '.claude/', visibility: 'local', guidance: '本地 workspace skills、settings 和 lock 默认不提交；需要共享时改用 team-shared 策略。' },
      { path: 'local/', visibility: 'local', guidance: '本地记录、日志和过程资料不提交。' },
    ],
  },
  'team-shared': {
    label: '团队共享',
    description: '私有团队仓库可共享经团队确认的 Claude Code 配置和 workspace skills，但仍忽略运行态记录。',
    excludes: [
      '/.claude/local/',
      '/.claude/settings.local.json',
      '/.claude/worktrees/',
      '/.claude/skills/*/resources/.state/',
      '/local/work-journal/records/*',
      '!/local/work-journal/records/.gitkeep',
      '/local/thinking-distiller/sessions/*',
      '!/local/thinking-distiller/sessions/.gitkeep',
    ],
    recommendations: [
      { path: 'CLAUDE.md', visibility: 'shared', guidance: '可作为团队协作规则提交。' },
      { path: '.claude/', visibility: 'shared', guidance: '可提交团队确认的 settings、skills 和索引；不要提交 worktrees 或运行态缓存。' },
      { path: 'local/', visibility: 'mixed', guidance: '可提交索引和占位文件，不提交真实日志、sessions 和个人过程资料。' },
    ],
  },
  'source-repo': {
    label: '插件/技能源码仓库',
    description: '当前仓库本身维护插件或 skill 源码，初始化产物通常只是 dogfood 结果，不应和源码重复提交。',
    excludes: ['/CLAUDE.md', '/.claude/', '/local/'],
    recommendations: [
      { path: 'CLAUDE.md', visibility: 'curate', guidance: '默认本地保留；如需支持二次开发者，应手工整理成公开贡献者版后再提交。' },
      { path: '.claude/', visibility: 'local', guidance: '安装后的 workspace skills 会和 resources/packs 或源码重复，建议只本地保留。' },
      { path: 'local/', visibility: 'local', guidance: 'dogfood 过程记录和本地长期资料不提交。' },
    ],
  },
};

function usage() {
  console.log(`claude-project-init

用法：
  claude-project-init list [--json]
  claude-project-init plan --target <path> [--packs a,b | --preset name | --recommended | --all | --no-packs] [--git-policy local-only|public-repo|team-shared|source-repo] [--write-git-exclude] [--json]
  claude-project-init apply --target <path> [--packs a,b | --preset name | --recommended | --all | --no-packs] [--git-policy local-only|public-repo|team-shared|source-repo] [--write-git-exclude] [--yes] [--json]

示例：
  claude-project-init list
  claude-project-init plan --target . --recommended
  claude-project-init plan --target . --preset thinking-lab
  claude-project-init apply --target . --packs work-journal,clear-thinking --yes
`);
}

function parseArgs(argv) {
  const args = { _: [] };
  const booleanFlags = new Set(['json', 'recommended', 'all', 'yes', 'help', 'no-packs', 'write-git-exclude']);
  const valueFlags = new Set(['target', 'packs', 'preset', 'git-policy']);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    if (booleanFlags.has(key)) {
      args[key] = true;
      continue;
    }
    if (!valueFlags.has(key)) {
      throw new Error(`未知参数：--${key}`);
    }
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`参数 --${key} 需要值`);
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function writeText(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function writeTextIfChanged(file, content) {
  if (sameFileContent(file, content)) {
    return false;
  }
  writeText(file, content);
  return true;
}

function writeJsonIfChanged(file, data) {
  const content = `${JSON.stringify(data, null, 2)}\n`;
  if (sameFileContent(file, content)) {
    return false;
  }
  writeText(file, content);
  return true;
}

function writeBuffer(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function normalizeSlashes(value) {
  return value.replaceAll(path.sep, '/');
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`找不到资源清单：${MANIFEST_PATH}`);
  }
  const manifest = readJson(MANIFEST_PATH);
  if (!Array.isArray(manifest.packs)) {
    throw new Error('resources/manifest.json 缺少 packs 数组');
  }
  const packs = manifest.packs.map((entry) => loadPack(entry));
  return { ...manifest, packs };
}

function loadPack(entry) {
  if (!entry.id || !entry.path) {
    throw new Error('manifest.packs 每项必须包含 id 和 path');
  }
  const packDir = safeJoin(RESOURCES, entry.path);
  const packJson = path.join(packDir, 'pack.json');
  if (!fs.existsSync(packJson)) {
    throw new Error(`找不到 pack.json：${packJson}`);
  }
  const pack = readJson(packJson);
  if (pack.id !== entry.id) {
    throw new Error(`pack id 不一致：manifest=${entry.id}, pack=${pack.id}`);
  }
  if (!pack.target || !Array.isArray(pack.files)) {
    throw new Error(`pack ${pack.id} 必须包含 target 和 files`);
  }
  return {
    ...pack,
    recommended: Boolean(entry.recommended || pack.recommended),
    dir: packDir,
  };
}

function safeJoin(root, candidate) {
  if (typeof candidate !== 'string' || !candidate) {
    throw new Error('路径不能为空');
  }
  if (path.isAbsolute(candidate)) {
    throw new Error(`不允许绝对路径：${candidate}`);
  }
  const resolved = path.resolve(root, candidate);
  ensureInside(root, resolved);
  return resolved;
}

function ensureInside(root, candidate) {
  const rootResolved = path.resolve(root);
  const candidateResolved = path.resolve(candidate);
  const relative = path.relative(rootResolved, candidateResolved);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return;
  }
  throw new Error(`路径越界：${candidate}`);
}

function resolveTarget(targetArg) {
  const target = path.resolve(targetArg || process.cwd());
  if (!fs.existsSync(target)) {
    throw new Error(`目标工作区不存在：${target}`);
  }
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`目标不是普通目录：${target}`);
  }
  return target;
}

function detectDefaultGitPolicy(target) {
  const pluginJson = path.join(target, '.claude-plugin', 'plugin.json');
  const resourceManifest = path.join(target, 'resources', 'manifest.json');
  if (fs.existsSync(pluginJson) || fs.existsSync(resourceManifest)) {
    return 'source-repo';
  }
  return 'local-only';
}

function resolveGitPolicy(target, policyName) {
  const name = policyName || detectDefaultGitPolicy(target);
  const policy = GIT_POLICIES[name];
  if (!policy) {
    throw new Error(`未知 git policy：${name}。可用值：${Object.keys(GIT_POLICIES).join(', ')}`);
  }
  return { name, inferred: !policyName, ...policy };
}

function findGitRoot(start) {
  let current = path.resolve(start);
  while (true) {
    const gitPath = path.join(current, '.git');
    if (fs.existsSync(gitPath) && fs.lstatSync(gitPath).isDirectory()) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function gitExcludePatternForTarget(gitRoot, target, pattern) {
  const negated = pattern.startsWith('!');
  const rawPattern = negated ? pattern.slice(1) : pattern;
  const normalizedPattern = normalizeSlashes(rawPattern).replace(/^\/+/, '');
  const targetRelative = normalizeSlashes(path.relative(gitRoot, target));
  const scoped = targetRelative ? `/${targetRelative}/${normalizedPattern}` : `/${normalizedPattern}`;
  return negated ? `!${scoped}` : scoped;
}

function gitExcludeBlock(gitPolicy) {
  return [
    '# claude-project-init:git-visibility:start',
    `# policy: ${gitPolicy.name} - ${gitPolicy.label}`,
    ...gitPolicy.excludePatterns,
    '# claude-project-init:git-visibility:end',
  ].join('\n');
}

function gitPolicyPlan(target, policy, writeGitExclude) {
  const gitRoot = findGitRoot(target);
  const patterns = gitRoot
    ? policy.excludes.map((pattern) => gitExcludePatternForTarget(gitRoot, target, pattern))
    : [];
  return {
    name: policy.name,
    label: policy.label,
    inferred: policy.inferred,
    description: policy.description,
    recommendations: policy.recommendations,
    gitRoot,
    excludeFile: gitRoot ? relativeToTarget(target, path.join(gitRoot, '.git', 'info', 'exclude')) : null,
    excludePatterns: patterns,
    writeGitExclude: Boolean(writeGitExclude),
  };
}

function writeGitInfoExclude(target, gitPolicy) {
  if (!gitPolicy.writeGitExclude) {
    return false;
  }
  if (!gitPolicy.gitRoot) {
    throw new Error('未找到 Git 仓库，无法写入 .git/info/exclude');
  }
  const excludeFile = path.join(gitPolicy.gitRoot, '.git', 'info', 'exclude');
  fs.mkdirSync(path.dirname(excludeFile), { recursive: true });
  const existing = fs.existsSync(excludeFile) ? readText(excludeFile) : '';
  const block = gitExcludeBlock(gitPolicy);
  let next;
  const markerState = validateControlledBlockMarkers(
    existing,
    '# claude-project-init:git-visibility:start',
    '# claude-project-init:git-visibility:end',
  );
  if (!markerState.ok) {
    throw new Error(`.git/info/exclude 中的 claude-project-init marker 异常：${markerState.reason}`);
  }
  if (markerState.hasBlock) {
    next = upsertBlock(existing, '# claude-project-init:git-visibility:start', '# claude-project-init:git-visibility:end', block);
  } else {
    const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
    next = `${existing}${prefix}${block}\n`;
  }
  if (next === existing) {
    return false;
  }
  writeText(excludeFile, next);
  return true;
}

function resolvePackDependencies(manifest, selected) {
  const byId = new Map(manifest.packs.map((pack) => [pack.id, pack]));
  const explicitIds = new Set(selected.map((pack) => pack.id));
  const resolved = [];
  const visiting = new Set();
  const seen = new Set();

  function visit(pack) {
    if (seen.has(pack.id)) return;
    if (visiting.has(pack.id)) {
      throw new Error(`检测到 pack 依赖环：${pack.id}`);
    }
    visiting.add(pack.id);
    for (const dependencyId of pack.dependencies || []) {
      const dependency = byId.get(dependencyId);
      if (!dependency) {
        throw new Error(`pack ${pack.id} 依赖不存在的 pack：${dependencyId}`);
      }
      visit(dependency);
    }
    visiting.delete(pack.id);
    seen.add(pack.id);
    resolved.push(pack);
  }

  for (const pack of selected) {
    visit(pack);
  }
  return resolved.map((pack) => ({
    ...pack,
    selectionReason: explicitIds.has(pack.id) ? 'requested' : 'dependency',
  }));
}

function selectPacks(manifest, args) {
  if (args['no-packs']) {
    return [];
  }

  let selected;
  if (args.all) {
    selected = manifest.packs;
  } else if (args.packs) {
    const wanted = args.packs.split(',').map((item) => item.trim()).filter(Boolean);
    selected = [];
    for (const id of wanted) {
      const pack = manifest.packs.find((item) => item.id === id);
      if (!pack) {
        throw new Error(`未知 skill pack：${id}`);
      }
      selected.push(pack);
    }
  } else if (args.preset) {
    const preset = manifest.presets?.[args.preset];
    if (!Array.isArray(preset)) {
      throw new Error(`未知 preset：${args.preset}`);
    }
    selected = selectPacks(manifest, { packs: preset.join(',') });
    return selected;
  } else {
    selected = manifest.packs.filter((pack) => pack.recommended);
  }

  return resolvePackDependencies(manifest, selected);
}

function relativeToTarget(target, file) {
  return normalizeSlashes(path.relative(target, file));
}

function relativeToRoot(file) {
  return normalizeSlashes(path.relative(ROOT, file));
}

function sameFileContent(file, content) {
  if (!fs.existsSync(file)) {
    return false;
  }
  const stat = fs.lstatSync(file);
  if (!stat.isFile()) {
    return false;
  }
  return fs.readFileSync(file).equals(Buffer.isBuffer(content) ? content : Buffer.from(content));
}

function ensureWritableTargetPath(target, file) {
  ensureInside(target, file);
  const targetRoot = path.resolve(target);
  const targetFile = path.resolve(file);
  const relative = path.relative(targetRoot, targetFile);
  const parts = relative.split(path.sep).filter(Boolean);
  let current = targetRoot;
  for (const part of parts) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) {
      return;
    }
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error(`目标路径包含符号链接或 junction，拒绝写入：${relativeToTarget(target, current)}`);
    }
    if (current === targetFile && !stat.isFile()) {
      throw new Error(`目标路径不是普通文件，拒绝写入：${relativeToTarget(target, current)}`);
    }
    if (current !== targetFile && !stat.isDirectory()) {
      throw new Error(`目标父路径不是目录，拒绝写入：${relativeToTarget(target, current)}`);
    }
  }
}

function isDirectoryEntry(source, fileEntry) {
  return fileEntry.type === 'directory' || (fs.existsSync(source) && fs.statSync(source).isDirectory());
}

function shouldExclude(relativePath, patterns = []) {
  const normalized = normalizeSlashes(relativePath);
  const allPatterns = [...DEFAULT_EXCLUDES, ...(patterns || [])];
  return allPatterns.some((pattern) => {
    if (pattern === normalized) return true;
    if (pattern === '**/*.pyc') return normalized.endsWith('.pyc');
    if (pattern === '**/.DS_Store') return normalized.endsWith('/.DS_Store') || normalized === '.DS_Store';
    if (pattern === '**/.state/**') return normalized.includes('/.state/') || normalized.startsWith('.state/');
    if (pattern === '**/__pycache__/**') return normalized.includes('/__pycache__/') || normalized.startsWith('__pycache__/');
    if (pattern === '**/records/**') return normalized.includes('/records/') || normalized.startsWith('records/');
    if (pattern === '**/.tmp/**') return normalized.includes('/.tmp/') || normalized.startsWith('.tmp/');
    if (pattern === '**/.claude/worktrees/**') return normalized.includes('/.claude/worktrees/') || normalized.startsWith('.claude/worktrees/');
    if (pattern.startsWith('**/') && pattern.endsWith('/**')) {
      const part = pattern.slice(3, -3);
      return normalized.includes(`/${part}/`) || normalized.startsWith(`${part}/`);
    }
    if (pattern.startsWith('**/*')) {
      return normalized.endsWith(pattern.slice(4));
    }
    return false;
  });
}

function listDirectoryFiles(sourceRoot, exclude = []) {
  const files = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      const relative = normalizeSlashes(path.relative(sourceRoot, fullPath));
      if (shouldExclude(relative, exclude)) {
        continue;
      }
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        files.push({ source: fullPath, relative });
      }
    }
  }
  walk(sourceRoot);
  return files;
}

function expandFileEntry(pack, target, fileEntry) {
  const source = safeJoin(pack.dir, fileEntry.from);
  const destinationRoot = safeJoin(target, pack.target);
  if (!fs.existsSync(source)) {
    return { missing: source, files: [], directory: isDirectoryEntry(source, fileEntry) };
  }

  const sourceStat = fs.lstatSync(source);
  if (sourceStat.isSymbolicLink()) {
    return { invalidSource: source, invalidReason: 'source-is-symlink', files: [], directory: fileEntry.type === 'directory' };
  }

  if (isDirectoryEntry(source, fileEntry)) {
    if (!sourceStat.isDirectory()) {
      return { invalidSource: source, invalidReason: 'source-is-not-directory', files: [], directory: true };
    }
    const files = listDirectoryFiles(source, fileEntry.exclude).map((file) => ({
      source: file.source,
      destination: safeJoin(destinationRoot, path.join(fileEntry.to, file.relative)),
      relative: file.relative,
    }));
    return { missing: null, files, directory: true, destinationRoot: safeJoin(destinationRoot, fileEntry.to) };
  }

  if (!sourceStat.isFile()) {
    return { invalidSource: source, invalidReason: 'source-is-not-regular-file', files: [], directory: false };
  }

  return {
    missing: null,
    directory: false,
    files: [{
      source,
      destination: safeJoin(destinationRoot, fileEntry.to),
      relative: fileEntry.to,
    }],
  };
}

function buildPlan(target, manifest, packs, options = {}) {
  const actions = [];
  const conflicts = [];
  const installed = [];
  const gitPolicy = gitPolicyPlan(target, options.gitPolicy, options.writeGitExclude);

  for (const pack of packs) {
    installed.push({ id: pack.id, name: pack.name, version: pack.version, description: pack.description, target: pack.target, dependencies: pack.dependencies || [], selectionReason: pack.selectionReason || 'requested' });
    for (const fileEntry of pack.files) {
      const expanded = expandFileEntry(pack, target, fileEntry);
      if (expanded.missing) {
        conflicts.push({ type: 'missing-source', pack: pack.id, source: relativeToRoot(expanded.missing) });
        continue;
      }
      if (expanded.invalidSource) {
        conflicts.push({ type: expanded.invalidReason, pack: pack.id, source: relativeToRoot(expanded.invalidSource) });
        continue;
      }

      let createCount = 0;
      let skipSameCount = 0;
      for (const file of expanded.files) {
        const content = fs.readFileSync(file.source);
        const destinationExists = fs.existsSync(file.destination);
        if (!destinationExists) {
          try {
            ensureWritableTargetPath(target, file.destination);
            createCount += 1;
          } catch (error) {
            file.unsafe = true;
            conflicts.push({ type: 'unsafe-target-path', pack: pack.id, path: relativeToTarget(target, file.destination), reason: error.message });
          }
        } else if (!fs.lstatSync(file.destination).isFile()) {
          conflicts.push({ type: 'target-not-regular-file', pack: pack.id, path: relativeToTarget(target, file.destination) });
        } else if (sameFileContent(file.destination, content)) {
          skipSameCount += 1;
        } else {
          conflicts.push({ type: 'file-exists-different', pack: pack.id, path: relativeToTarget(target, file.destination) });
        }
      }

      if (expanded.directory) {
        actions.push({
          type: 'sync-dir',
          pack: pack.id,
          path: relativeToTarget(target, expanded.destinationRoot),
          source: relativeToRoot(safeJoin(pack.dir, fileEntry.from)),
          createCount,
          skipSameCount,
          reason: createCount ? `复制目录中的 ${createCount} 个新文件` : '目录已同步，无需新增文件',
        });
      } else {
        const file = expanded.files[0];
        if (!fs.existsSync(file.destination) && !file.unsafe) {
          actions.push({ type: 'create', pack: pack.id, path: relativeToTarget(target, file.destination), source: relativeToRoot(file.source) });
        } else if (sameFileContent(file.destination, fs.readFileSync(file.source))) {
          actions.push({ type: 'skip-same', pack: pack.id, path: relativeToTarget(target, file.destination) });
        }
      }
    }

    for (const initEntry of pack.initFiles || []) {
      const source = safeJoin(pack.dir, initEntry.from);
      const destination = safeJoin(target, initEntry.to);
      if (!fs.existsSync(source)) {
        conflicts.push({ type: 'missing-init-source', pack: pack.id, source: relativeToRoot(source) });
        continue;
      }
      if (!fs.existsSync(destination)) {
        try {
          ensureWritableTargetPath(target, destination);
          actions.push({
            type: 'create-init',
            pack: pack.id,
            path: relativeToTarget(target, destination),
            source: relativeToRoot(source),
            reason: initEntry.description || '初始化 skill 运行所需工作区文件',
          });
        } catch (error) {
          conflicts.push({ type: 'unsafe-init-target-path', pack: pack.id, path: relativeToTarget(target, destination), reason: error.message });
        }
      } else if (!fs.lstatSync(destination).isFile()) {
        conflicts.push({ type: 'init-target-not-regular-file', pack: pack.id, path: relativeToTarget(target, destination) });
      } else if (sameFileContent(destination, fs.readFileSync(source))) {
        actions.push({ type: 'skip-init-same', pack: pack.id, path: relativeToTarget(target, destination) });
      } else {
        actions.push({ type: 'skip-init-existing', pack: pack.id, path: relativeToTarget(target, destination), reason: '目标文件已存在，按 create-if-missing 策略保留用户内容' });
      }
    }
  }

  function addWorkspaceFileAction(file, actionPath, existingType, reason, markerPairs = []) {
    try {
      ensureWritableTargetPath(target, file);
      if (fs.existsSync(file)) {
        const content = readText(file);
        for (const pair of markerPairs) {
          const markerState = validateControlledBlockMarkers(content, pair.start, pair.end);
          if (!markerState.ok) {
            conflicts.push({ type: 'invalid-controlled-block-markers', path: actionPath, reason: markerState.reason });
            return;
          }
        }
      }
      actions.push({ type: fs.existsSync(file) ? existingType : 'create', path: actionPath, reason });
    } catch (error) {
      conflicts.push({ type: 'unsafe-target-path', path: actionPath, reason: error.message });
    }
  }

  addWorkspaceFileAction(path.join(target, 'CLAUDE.md'), 'CLAUDE.md', 'merge', '维护已安装 workspace skills 列表', [
    { start: '<!-- claude-project-init:skills:start -->', end: '<!-- claude-project-init:skills:end -->' },
  ]);
  addWorkspaceFileAction(path.join(target, '.claude', 'settings.json'), '.claude/settings.json', 'merge-json', '保守初始化 Claude Code project settings');
  addWorkspaceFileAction(path.join(target, '.claude', 'skills', 'INDEX.md'), '.claude/skills/INDEX.md', 'merge', '维护 workspace skills 索引', [
    { start: '<!-- claude-project-init:index:start -->', end: '<!-- claude-project-init:index:end -->' },
  ]);
  addWorkspaceFileAction(path.join(target, '.claude', 'workspace-index.md'), '.claude/workspace-index.md', 'merge', '根据 CLAUDE.md、.claude/skills 和各 pack 的索引声明维护工作区入口索引', [
    { start: '<!-- claude-project-init:secondary-index:start -->', end: '<!-- claude-project-init:secondary-index:end -->' },
    { start: '<!-- claude-project-init:assets:start -->', end: '<!-- claude-project-init:assets:end -->' },
  ]);
  addWorkspaceFileAction(path.join(target, '.claude', 'project-init.lock.json'), '.claude/project-init.lock.json', 'update', '记录 claude-project-init 安装状态');

  if (gitPolicy.writeGitExclude) {
    if (gitPolicy.gitRoot) {
      const excludeFile = path.join(gitPolicy.gitRoot, '.git', 'info', 'exclude');
      if (fs.existsSync(excludeFile)) {
        const markerState = validateControlledBlockMarkers(
          readText(excludeFile),
          '# claude-project-init:git-visibility:start',
          '# claude-project-init:git-visibility:end',
        );
        if (!markerState.ok) {
          conflicts.push({ type: 'invalid-git-exclude-markers', path: gitPolicy.excludeFile, reason: markerState.reason });
        }
      }
      actions.push({
        type: 'update-git-exclude',
        path: gitPolicy.excludeFile,
        reason: `按 ${gitPolicy.name} 策略把本地初始化产物写入 .git/info/exclude`,
      });
    } else {
      conflicts.push({ type: 'git-root-not-found', path: '.git/info/exclude', reason: '指定了 --write-git-exclude，但目标目录不在 Git 仓库中' });
    }
  }

  return {
    target,
    plugin: manifest.plugin,
    selectedPacks: installed,
    actions,
    conflicts,
    canApply: conflicts.length === 0,
    gitPolicy,
  };
}

function skillsBlock(packs) {
  const lines = packs.map((pack) => `- \`${pack.name}\`：${pack.description}`);
  return [
    '<!-- claude-project-init:skills:start -->',
    ...lines,
    '<!-- claude-project-init:skills:end -->',
  ].join('\n');
}

function indexBlock(packs) {
  const lines = [];
  for (const pack of packs) {
    lines.push(`## ${pack.name}`);
    lines.push('');
    lines.push(pack.description || '暂无描述。');
    lines.push('');
    lines.push(`- 版本：\`${pack.version || 'unknown'}\``);
    lines.push(`- 路径：\`${pack.target}/SKILL.md\``);
    if (pack.dependencies?.length) {
      lines.push(`- 依赖：${pack.dependencies.map((item) => `\`${item}\``).join(', ')}`);
    }
    lines.push('');
  }
  return [
    '<!-- claude-project-init:index:start -->',
    ...lines,
    '<!-- claude-project-init:index:end -->',
  ].join('\n');
}

function parseSkillMetadata(skillFile) {
  const content = readText(skillFile);
  const metadata = {};
  if (content.startsWith('---')) {
    const end = content.indexOf('\n---', 3);
    if (end !== -1) {
      const frontmatter = content.slice(3, end).split(/\r?\n/);
      for (const line of frontmatter) {
        const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (match) {
          metadata[match[1]] = match[2].replace(/^['\"]|['\"]$/g, '').trim();
        }
      }
    }
  }
  return metadata;
}

function discoverWorkspaceSkills(target, packs = []) {
  const byName = new Map();
  for (const pack of packs) {
    byName.set(pack.name, {
      id: pack.id,
      name: pack.name,
      version: pack.version,
      description: pack.description,
      target: pack.target,
      dependencies: pack.dependencies || [],
    });
  }

  const skillsDir = path.join(target, '.claude', 'skills');
  if (!fs.existsSync(skillsDir)) {
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillFile)) {
      continue;
    }
    const metadata = parseSkillMetadata(skillFile);
    const name = metadata.name || entry.name;
    const existing = byName.get(name);
    byName.set(name, {
      id: existing?.id || name,
      name,
      version: metadata.version || existing?.version || 'unknown',
      description: metadata.description || existing?.description || '暂无描述。',
      target: existing?.target || `.claude/skills/${entry.name}`,
      dependencies: existing?.dependencies || [],
      selectionReason: existing?.selectionReason || 'existing',
    });
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function uniqueByPath(entries) {
  const seen = new Set();
  const result = [];
  for (const entry of entries) {
    if (!entry?.path || seen.has(entry.path)) continue;
    seen.add(entry.path);
    result.push(entry);
  }
  return result;
}

function collectSecondaryIndexEntries(skills, packs) {
  const entries = [];
  for (const pack of packs) {
    entries.push(...(pack.workspaceIndexEntries?.secondaryIndexes || []));
  }

  if (!entries.some((entry) => entry.path === 'local/work-journal/index.md') && skills.some((skill) => skill.name === 'work-journal')) {
    entries.push({
      path: 'local/work-journal/index.md',
      scope: '工作日志历史记录',
      contents: '每条记录的日期、标题、状态、关键词/适用场景、记录文件路径、备注',
      next: '命中的 local/work-journal/records/*.md',
    });
  }

  return uniqueByPath(entries);
}

function collectAssetEntries(skills, packs) {
  const entries = [
    { path: 'CLAUDE.md', purpose: '工作区 Claude Code 协作规则' },
    { path: '.claude/workspace-index.md', purpose: '工作区入口级导航索引' },
    { path: '.claude/settings.json', purpose: '项目级 Claude Code settings' },
    { path: '.claude/skills/INDEX.md', purpose: '已安装 workspace skills 索引' },
  ];

  for (const pack of packs) {
    entries.push(...(pack.workspaceIndexEntries?.assets || []));
  }

  for (const skill of skills) {
    if (!entries.some((entry) => entry.path === `${skill.target}/SKILL.md`)) {
      entries.push({ path: `${skill.target}/SKILL.md`, purpose: skill.description || `${skill.name} 技能入口` });
    }
  }

  return uniqueByPath(entries);
}

function secondaryIndexBlock(skills, packs = []) {
  const lines = [
    '<!-- claude-project-init:secondary-index:start -->',
    '| 索引路径 | 管理范围 | 包含信息 | 下一步入口 |',
    '| --- | --- | --- | --- |',
  ];

  for (const entry of collectSecondaryIndexEntries(skills, packs)) {
    lines.push(`| \`${entry.path}\` | ${entry.scope || ''} | ${entry.contents || ''} | ${entry.next || ''} |`);
  }

  lines.push('<!-- claude-project-init:secondary-index:end -->');
  return lines.join('\n');
}

function workspaceAssetsBlock(skills, packs = []) {
  const lines = [
    '<!-- claude-project-init:assets:start -->',
    '| 路径 | 用途 |',
    '| --- | --- |',
  ];

  for (const entry of collectAssetEntries(skills, packs)) {
    lines.push(`| \`${entry.path}\` | ${entry.purpose || ''} |`);
  }

  lines.push('<!-- claude-project-init:assets:end -->');
  return lines.join('\n');
}

function markerPositions(content, marker) {
  const positions = [];
  let offset = 0;
  while (offset < content.length) {
    const index = content.indexOf(marker, offset);
    if (index === -1) break;
    positions.push(index);
    offset = index + marker.length;
  }
  return positions;
}

function validateControlledBlockMarkers(content, startMarker, endMarker) {
  const starts = markerPositions(content, startMarker);
  const ends = markerPositions(content, endMarker);
  if (starts.length === 0 && ends.length === 0) {
    return { ok: true, hasBlock: false };
  }
  if (starts.length !== 1 || ends.length !== 1) {
    return { ok: false, reason: `受控块 marker 数量异常：start=${starts.length}, end=${ends.length}` };
  }
  if (starts[0] > ends[0]) {
    return { ok: false, reason: '受控块 marker 顺序异常：start 出现在 end 之后' };
  }
  return { ok: true, hasBlock: true, start: starts[0], end: ends[0] };
}

function upsertBlock(content, startMarker, endMarker, block) {
  const markerState = validateControlledBlockMarkers(content, startMarker, endMarker);
  if (!markerState.ok) {
    throw new Error(markerState.reason);
  }
  if (markerState.hasBlock) {
    return `${content.slice(0, markerState.start)}${block}${content.slice(markerState.end + endMarker.length)}`;
  }
  const separator = content.endsWith('\n') ? '\n' : '\n\n';
  return `${content}${separator}${block}\n`;
}

function renderClaudeMd(packs) {
  const template = readText(path.join(RESOURCES, 'templates', 'CLAUDE.md.template'));
  return upsertBlock(
    template,
    '<!-- claude-project-init:skills:start -->',
    '<!-- claude-project-init:skills:end -->',
    skillsBlock(packs),
  );
}

function renderIndex(packs) {
  const template = readText(path.join(RESOURCES, 'templates', 'skills-INDEX.md.template'));
  return upsertBlock(
    template,
    '<!-- claude-project-init:index:start -->',
    '<!-- claude-project-init:index:end -->',
    indexBlock(packs),
  );
}

function renderWorkspaceIndex(skills, packs) {
  let content = readText(path.join(RESOURCES, 'templates', 'workspace-index.md.template'));
  content = upsertBlock(
    content,
    '<!-- claude-project-init:secondary-index:start -->',
    '<!-- claude-project-init:secondary-index:end -->',
    secondaryIndexBlock(skills, packs),
  );
  content = upsertBlock(
    content,
    '<!-- claude-project-init:assets:start -->',
    '<!-- claude-project-init:assets:end -->',
    workspaceAssetsBlock(skills, packs),
  );
  return content;
}

function mergeClaudeMd(target, packs) {
  const file = path.join(target, 'CLAUDE.md');
  const skills = discoverWorkspaceSkills(target, packs);
  if (!fs.existsSync(file)) {
    ensureWritableTargetPath(target, file);
    writeTextIfChanged(file, renderClaudeMd(skills));
    return;
  }
  ensureWritableTargetPath(target, file);
  const content = readText(file);
  const merged = upsertBlock(
    content,
    '<!-- claude-project-init:skills:start -->',
    '<!-- claude-project-init:skills:end -->',
    skillsBlock(skills),
  );
  writeTextIfChanged(file, merged);
}

function mergeIndex(target, packs) {
  const file = path.join(target, '.claude', 'skills', 'INDEX.md');
  const skills = discoverWorkspaceSkills(target, packs);
  if (!fs.existsSync(file)) {
    ensureWritableTargetPath(target, file);
    writeTextIfChanged(file, renderIndex(skills));
    return;
  }
  ensureWritableTargetPath(target, file);
  const content = readText(file);
  const merged = upsertBlock(
    content,
    '<!-- claude-project-init:index:start -->',
    '<!-- claude-project-init:index:end -->',
    indexBlock(skills),
  );
  writeTextIfChanged(file, merged);
}

function mergeWorkspaceIndex(target, packs) {
  const file = path.join(target, '.claude', 'workspace-index.md');
  const skills = discoverWorkspaceSkills(target, packs);
  if (!fs.existsSync(file)) {
    ensureWritableTargetPath(target, file);
    writeTextIfChanged(file, renderWorkspaceIndex(skills, packs));
    return;
  }
  ensureWritableTargetPath(target, file);
  let content = readText(file);
  content = upsertBlock(
    content,
    '<!-- claude-project-init:secondary-index:start -->',
    '<!-- claude-project-init:secondary-index:end -->',
    secondaryIndexBlock(skills, packs),
  );
  content = upsertBlock(
    content,
    '<!-- claude-project-init:assets:start -->',
    '<!-- claude-project-init:assets:end -->',
    workspaceAssetsBlock(skills, packs),
  );
  writeTextIfChanged(file, content);
}

function mergeSettings(target) {
  const file = path.join(target, '.claude', 'settings.json');
  ensureWritableTargetPath(target, file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    const template = readJson(path.join(RESOURCES, 'templates', 'settings.json'));
    writeJsonIfChanged(file, template);
    return;
  }
  const existing = readJson(file);
  if (!existing.$schema) {
    existing.$schema = 'https://json.schemastore.org/claude-code-settings.json';
  }
  writeJsonIfChanged(file, existing);
}

function copyPackFileEntry(pack, target, fileEntry) {
  const expanded = expandFileEntry(pack, target, fileEntry);
  if (expanded.missing) {
    throw new Error(`缺少资源文件：${relativeToRoot(expanded.missing)}`);
  }
  if (expanded.invalidSource) {
    throw new Error(`资源文件类型不安全：${relativeToRoot(expanded.invalidSource)} (${expanded.invalidReason})`);
  }
  for (const file of expanded.files) {
    if (!fs.existsSync(file.destination)) {
      ensureWritableTargetPath(target, file.destination);
      writeBuffer(file.destination, fs.readFileSync(file.source));
    }
  }
}

function applyPlan(target, packs, plan) {
  if (plan.conflicts.length > 0) {
    throw new Error('存在冲突，未写入。请先处理冲突或选择其他 pack。');
  }

  for (const pack of packs) {
    for (const fileEntry of pack.files) {
      copyPackFileEntry(pack, target, fileEntry);
    }

    for (const initEntry of pack.initFiles || []) {
      const source = safeJoin(pack.dir, initEntry.from);
      const destination = safeJoin(target, initEntry.to);
      if (!fs.existsSync(destination)) {
        ensureWritableTargetPath(target, destination);
        writeBuffer(destination, fs.readFileSync(source));
      }
    }
  }

  mergeClaudeMd(target, packs);
  mergeSettings(target);
  mergeIndex(target, packs);
  mergeWorkspaceIndex(target, packs);

  const lockFile = path.join(target, '.claude', 'project-init.lock.json');
  const existingLock = fs.existsSync(lockFile) ? readJson(lockFile) : {};
  const existingPacks = existingLock && typeof existingLock.packs === 'object' && !Array.isArray(existingLock.packs)
    ? existingLock.packs
    : {};
  const selectedPacks = Object.fromEntries(packs.map((pack) => [pack.id, {
    version: pack.version,
    target: pack.target,
    selectionReason: pack.selectionReason || 'requested',
    dependencies: pack.dependencies || [],
    initFiles: (pack.initFiles || []).map((entry) => entry.to),
    workspaceIndexEntries: pack.workspaceIndexEntries || {},
  }]));
  const lockData = {
    version: 1,
    plugin: 'claude-project-init',
    gitVisibility: {
      policy: plan.gitPolicy.name,
      writeGitExclude: plan.gitPolicy.writeGitExclude,
      excludePath: plan.gitPolicy.excludeFile,
      recommendations: plan.gitPolicy.recommendations,
    },
    packs: {
      ...existingPacks,
      ...selectedPacks,
    },
  };
  ensureWritableTargetPath(target, lockFile);
  writeJsonIfChanged(lockFile, lockData);
  writeGitInfoExclude(target, plan.gitPolicy);
}

function printList(manifest, asJson) {
  const coreInitializers = [
    { path: 'CLAUDE.md', description: '工作区 Claude Code 协作规则；workspace-index 会跟随它一起初始化/刷新' },
    { path: '.claude/workspace-index.md', description: 'CLAUDE.md 的入口级导航配套索引，根据已安装 skills 和 pack 声明维护' },
    { path: '.claude/settings.json', description: '项目级 Claude Code settings 保守初始化' },
    { path: '.claude/skills/INDEX.md', description: '已安装 workspace skills 索引' },
    { path: '.claude/project-init.lock.json', description: 'claude-project-init 安装状态记录' },
  ];
  const result = manifest.packs.map((pack) => ({
    id: pack.id,
    name: pack.name,
    version: pack.version,
    recommended: pack.recommended,
    category: pack.category,
    description: pack.description,
    dependencies: pack.dependencies || [],
  }));
  const gitPolicies = Object.fromEntries(Object.entries(GIT_POLICIES).map(([name, policy]) => [name, {
    label: policy.label,
    description: policy.description,
    excludes: policy.excludes,
  }]));
  if (asJson) {
    console.log(JSON.stringify({ coreInitializers, packs: result, presets: manifest.presets || {}, gitPolicies }, null, 2));
    return;
  }
  console.log('核心初始化项：');
  for (const item of coreInitializers) {
    console.log(`- ${item.path}：${item.description}`);
  }
  console.log('\n可安装 workspace skill packs：');
  for (const pack of result) {
    const marker = pack.recommended ? '推荐' : '可选';
    const dependencies = pack.dependencies.length ? `；依赖：${pack.dependencies.join(', ')}` : '';
    const description = dependencies ? pack.description.replace(/[。.]$/, '') : pack.description;
    console.log(`- ${pack.id} [${marker}]：${description}${dependencies}`);
  }
  console.log('\n可用 preset：');
  for (const [name, ids] of Object.entries(manifest.presets || {})) {
    console.log(`- ${name}: ${ids.join(', ')}`);
  }
  console.log('\nGit 可见性策略：');
  for (const [name, policy] of Object.entries(gitPolicies)) {
    console.log(`- ${name}：${policy.label}，${policy.description}`);
  }
}

function printPlan(plan, asJson) {
  if (asJson) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  console.log(`目标工作区：${plan.target}`);
  console.log('\n选择安装：');
  for (const pack of plan.selectedPacks) {
    const details = [];
    if (pack.selectionReason === 'dependency') {
      details.push('依赖自动带入');
    }
    if (pack.dependencies?.length) {
      details.push(`依赖：${pack.dependencies.join(', ')}`);
    }
    const suffix = details.length ? `（${details.join('；')}）` : '';
    console.log(`- ${pack.id}${suffix}：${pack.description}`);
  }
  console.log('\n计划操作：');
  for (const action of plan.actions) {
    const counts = action.type === 'sync-dir' ? `，新增 ${action.createCount}，跳过 ${action.skipSameCount}` : '';
    console.log(`- ${action.type}: ${action.path}${counts}${action.reason ? `（${action.reason}）` : ''}`);
  }
  if (plan.conflicts.length) {
    console.log('\n冲突：');
    for (const conflict of plan.conflicts) {
      const pack = conflict.pack ? ` (${conflict.pack})` : '';
      const reason = conflict.reason ? `：${conflict.reason}` : '';
      console.log(`- ${conflict.type}: ${conflict.path || conflict.source}${pack}${reason}`);
    }
  }
  if (plan.gitPolicy) {
    const inferred = plan.gitPolicy.inferred ? '，自动推断' : '';
    console.log(`\nGit 可见性策略：${plan.gitPolicy.name}（${plan.gitPolicy.label}${inferred}）`);
    console.log(`说明：${plan.gitPolicy.description}`);
    for (const item of plan.gitPolicy.recommendations) {
      console.log(`- ${item.path}：${item.visibility}，${item.guidance}`);
    }
    if (plan.gitPolicy.gitRoot) {
      console.log(`本地 exclude 文件：${plan.gitPolicy.excludeFile}`);
      if (plan.gitPolicy.writeGitExclude) {
        console.log('将写入 .git/info/exclude：');
      } else {
        console.log('建议写入 .git/info/exclude（传入 --write-git-exclude 后执行）：');
      }
      for (const pattern of plan.gitPolicy.excludePatterns) {
        console.log(`  ${pattern}`);
      }
    } else {
      console.log('未检测到 Git 仓库；不会生成本地 exclude 建议。');
    }
  }
  console.log(`\n可执行写入：${plan.canApply ? '是' : '否'}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || args.help) {
    usage();
    return;
  }

  const manifest = loadManifest();

  if (command === 'list') {
    printList(manifest, args.json);
    return;
  }

  if (command !== 'plan' && command !== 'apply') {
    throw new Error(`未知命令：${command}`);
  }

  const target = resolveTarget(args.target || process.cwd());
  const packs = selectPacks(manifest, args);
  const gitPolicy = resolveGitPolicy(target, args['git-policy']);
  const plan = buildPlan(target, manifest, packs, { gitPolicy, writeGitExclude: args['write-git-exclude'] });

  if (command === 'plan') {
    printPlan(plan, args.json);
    return;
  }

  if (!args.yes) {
    printPlan(plan, false);
    throw new Error('apply 需要显式传入 --yes。请先确认计划，再重新执行。');
  }

  applyPlan(target, packs, plan);
  const installed = packs.map((pack) => ({ id: pack.id, selectionReason: pack.selectionReason || 'requested' }));
  if (args.json) {
    console.log(JSON.stringify({ ok: true, target, installed, gitPolicy: plan.gitPolicy }, null, 2));
  } else {
    const requested = installed.filter((pack) => pack.selectionReason !== 'dependency').map((pack) => pack.id);
    const dependencies = installed.filter((pack) => pack.selectionReason === 'dependency').map((pack) => pack.id);
    console.log('初始化完成。');
    console.log(`目标工作区：${target}`);
    console.log(`安装技能：${requested.join(', ') || '无新增技能'}`);
    if (dependencies.length) {
      console.log(`依赖自动带入：${dependencies.join(', ')}`);
    }
    console.log(`Git 可见性策略：${plan.gitPolicy.name}（${plan.gitPolicy.label}）`);
    if (plan.gitPolicy.writeGitExclude) {
      console.log(`已按策略更新本地 exclude：${plan.gitPolicy.excludeFile}`);
    } else if (plan.gitPolicy.excludePatterns.length) {
      console.log('如不想提交本地初始化产物，可重新执行 plan/apply 时添加 --write-git-exclude，或手动写入 .git/info/exclude。');
    }
    console.log('建议在目标工作区执行 /reload-plugins 或重启 Claude Code。');
  }
}

try {
  main();
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}
