#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_FILE_TYPES = new Set(['file', 'directory']);
const ALLOWED_FILE_MODES = new Set(['copy']);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function warn(message) {
  console.log(`WARN: ${message}`);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`无法解析 JSON：${path.relative(ROOT, file)}：${error.message}`);
  }
}

function requireFile(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    fail(`缺少文件：${path.relative(ROOT, file)}`);
  }
}

function requireDir(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    fail(`缺少目录：${path.relative(ROOT, dir)}`);
  }
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} 必须是对象`);
  }
}

function requireString(obj, key, label) {
  if (typeof obj[key] !== 'string' || !obj[key].trim()) {
    fail(`${label}.${key} 必须是非空字符串`);
  }
}

function requireStringArray(value, label) {
  if (!Array.isArray(value)) {
    fail(`${label} 必须是数组`);
  }
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) {
      fail(`${label} 每项必须是非空字符串`);
    }
  }
}

function safeJoin(root, candidate, label) {
  if (typeof candidate !== 'string' || !candidate) {
    fail(`${label} 路径不能为空`);
  }
  if (path.isAbsolute(candidate)) {
    fail(`${label} 不允许绝对路径：${candidate}`);
  }
  const resolved = path.resolve(root, candidate);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    fail(`${label} 不允许越界：${candidate}`);
  }
  return resolved;
}

function validateRelativePath(candidate, label) {
  safeJoin(ROOT, candidate, label);
}

function validatePluginJson() {
  const file = path.join(ROOT, '.claude-plugin', 'plugin.json');
  requireFile(file);
  const plugin = readJson(file);
  requireObject(plugin, 'plugin');
  requireString(plugin, 'name', 'plugin');
  requireString(plugin, 'description', 'plugin');
  if (!KEBAB_RE.test(plugin.name)) {
    fail(`plugin.name 必须是 kebab-case：${plugin.name}`);
  }
  if (plugin.name !== 'claude-project-init') {
    warn(`plugin.name 当前为 ${plugin.name}，请确认是否符合仓库命名`);
  }
}

function validateSkills() {
  const skillsDir = path.join(ROOT, 'skills');
  requireDir(skillsDir);
  const skillNames = fs.readdirSync(skillsDir).filter((name) => fs.statSync(path.join(skillsDir, name)).isDirectory());
  if (!skillNames.length) {
    fail('skills/ 下至少需要一个技能目录');
  }
  for (const name of skillNames) {
    if (!KEBAB_RE.test(name)) {
      fail(`skill 目录必须是 kebab-case：${name}`);
    }
    requireFile(path.join(skillsDir, name, 'SKILL.md'));
  }
}

function validateFileEntry(packDir, entryId, fileEntry) {
  requireObject(fileEntry, `pack ${entryId}.files[]`);
  requireString(fileEntry, 'from', `pack ${entryId}.files[]`);
  requireString(fileEntry, 'to', `pack ${entryId}.files[]`);
  validateRelativePath(fileEntry.to, `pack ${entryId}.files[].to`);

  if (fileEntry.mode !== undefined && !ALLOWED_FILE_MODES.has(fileEntry.mode)) {
    fail(`pack ${entryId}.files[].mode 目前只支持 copy`);
  }
  if (fileEntry.type !== undefined && !ALLOWED_FILE_TYPES.has(fileEntry.type)) {
    fail(`pack ${entryId}.files[].type 只支持 file 或 directory`);
  }

  const source = safeJoin(packDir, fileEntry.from, `pack ${entryId}.files[].from`);
  if (fileEntry.type === 'directory') {
    requireDir(source);
  } else {
    requireFile(source);
  }

  if (fileEntry.exclude !== undefined) {
    requireStringArray(fileEntry.exclude, `pack ${entryId}.files[].exclude`);
  }
}

function validateInitFiles(packDir, entryId, pack) {
  if (pack.initFiles === undefined) {
    return;
  }
  if (!Array.isArray(pack.initFiles)) {
    fail(`pack ${entryId}.initFiles 必须是数组`);
  }
  for (const initEntry of pack.initFiles) {
    requireObject(initEntry, `pack ${entryId}.initFiles[]`);
    requireString(initEntry, 'from', `pack ${entryId}.initFiles[]`);
    requireString(initEntry, 'to', `pack ${entryId}.initFiles[]`);
    validateRelativePath(initEntry.to, `pack ${entryId}.initFiles[].to`);
    requireFile(safeJoin(packDir, initEntry.from, `pack ${entryId}.initFiles[].from`));
    if (initEntry.mode && initEntry.mode !== 'create-if-missing') {
      fail(`pack ${entryId}.initFiles[].mode 目前只支持 create-if-missing`);
    }
    if (initEntry.description !== undefined && typeof initEntry.description !== 'string') {
      fail(`pack ${entryId}.initFiles[].description 必须是字符串`);
    }
  }
}

function validateWorkspaceIndexEntries(entryId, pack) {
  if (pack.workspaceIndexEntries === undefined) {
    return;
  }
  requireObject(pack.workspaceIndexEntries, `pack ${entryId}.workspaceIndexEntries`);

  const secondaryIndexes = pack.workspaceIndexEntries.secondaryIndexes || [];
  if (!Array.isArray(secondaryIndexes)) {
    fail(`pack ${entryId}.workspaceIndexEntries.secondaryIndexes 必须是数组`);
  }
  for (const item of secondaryIndexes) {
    requireObject(item, `pack ${entryId}.workspaceIndexEntries.secondaryIndexes[]`);
    requireString(item, 'path', `pack ${entryId}.workspaceIndexEntries.secondaryIndexes[]`);
    requireString(item, 'scope', `pack ${entryId}.workspaceIndexEntries.secondaryIndexes[]`);
    requireString(item, 'contents', `pack ${entryId}.workspaceIndexEntries.secondaryIndexes[]`);
    requireString(item, 'next', `pack ${entryId}.workspaceIndexEntries.secondaryIndexes[]`);
    validateRelativePath(item.path, `pack ${entryId}.workspaceIndexEntries.secondaryIndexes[].path`);
  }

  const assets = pack.workspaceIndexEntries.assets || [];
  if (!Array.isArray(assets)) {
    fail(`pack ${entryId}.workspaceIndexEntries.assets 必须是数组`);
  }
  for (const item of assets) {
    requireObject(item, `pack ${entryId}.workspaceIndexEntries.assets[]`);
    requireString(item, 'path', `pack ${entryId}.workspaceIndexEntries.assets[]`);
    requireString(item, 'purpose', `pack ${entryId}.workspaceIndexEntries.assets[]`);
    validateRelativePath(item.path, `pack ${entryId}.workspaceIndexEntries.assets[].path`);
  }
}

function validatePack(entry, packDir, pack) {
  if (pack.id !== entry.id) {
    fail(`pack id 不一致：manifest=${entry.id}, pack=${pack.id}`);
  }
  requireString(pack, 'name', `pack ${entry.id}`);
  requireString(pack, 'description', `pack ${entry.id}`);
  requireString(pack, 'target', `pack ${entry.id}`);
  validateRelativePath(pack.target, `pack ${entry.id}.target`);

  if (!Array.isArray(pack.files) || !pack.files.length) {
    fail(`pack ${entry.id}.files 必须是非空数组`);
  }
  for (const fileEntry of pack.files) {
    validateFileEntry(packDir, entry.id, fileEntry);
  }

  validateInitFiles(packDir, entry.id, pack);
  validateWorkspaceIndexEntries(entry.id, pack);

  if (pack.dependencies !== undefined) {
    requireStringArray(pack.dependencies, `pack ${entry.id}.dependencies`);
  }
  if (pack.postInstallNotes !== undefined) {
    requireStringArray(pack.postInstallNotes, `pack ${entry.id}.postInstallNotes`);
  }
}

function validateDependencyGraph(packsById) {
  for (const [id, pack] of packsById.entries()) {
    for (const dependencyId of pack.dependencies || []) {
      if (dependencyId === id) {
        fail(`pack ${id} 不能依赖自己`);
      }
      if (!packsById.has(dependencyId)) {
        fail(`pack ${id} 依赖不存在的 pack：${dependencyId}`);
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(id, stack = []) {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      fail(`检测到 pack 依赖环：${[...stack, id].join(' -> ')}`);
    }
    visiting.add(id);
    for (const dependencyId of packsById.get(id).dependencies || []) {
      visit(dependencyId, [...stack, id]);
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of packsById.keys()) {
    visit(id);
  }
}

function validateResources() {
  const resources = path.join(ROOT, 'resources');
  const manifestFile = path.join(resources, 'manifest.json');
  requireFile(manifestFile);
  const manifest = readJson(manifestFile);
  requireObject(manifest, 'resources/manifest.json');
  if (!Array.isArray(manifest.packs)) {
    fail('resources/manifest.json 必须包含 packs 数组');
  }

  const seen = new Set();
  const packRecords = [];
  const packsById = new Map();
  for (const entry of manifest.packs) {
    requireObject(entry, 'manifest.packs[]');
    requireString(entry, 'id', 'manifest.packs[]');
    requireString(entry, 'path', `manifest.packs[${entry.id}]`);
    if (!KEBAB_RE.test(entry.id)) {
      fail(`pack id 必须是 kebab-case：${entry.id}`);
    }
    if (seen.has(entry.id)) {
      fail(`重复 pack id：${entry.id}`);
    }
    seen.add(entry.id);

    const packDir = safeJoin(resources, entry.path, `pack ${entry.id}.path`);
    requireDir(packDir);
    const packFile = path.join(packDir, 'pack.json');
    requireFile(packFile);
    const pack = readJson(packFile);
    requireObject(pack, `pack ${entry.id}`);
    packRecords.push({ entry, packDir, pack });
    packsById.set(entry.id, pack);
  }

  for (const { entry, packDir, pack } of packRecords) {
    validatePack(entry, packDir, pack);
  }
  validateDependencyGraph(packsById);

  for (const [name, preset] of Object.entries(manifest.presets || {})) {
    if (!Array.isArray(preset)) {
      fail(`preset ${name} 必须是数组`);
    }
    for (const id of preset) {
      if (!seen.has(id)) {
        fail(`preset ${name} 引用了不存在的 pack：${id}`);
      }
    }
  }

  const templates = manifest.templates || {};
  for (const [key, templatePath] of Object.entries(templates)) {
    requireFile(safeJoin(resources, templatePath, `template ${key}`));
  }
}

validatePluginJson();
validateSkills();
validateResources();
console.log('OK: claude-project-init plugin structure is valid');
