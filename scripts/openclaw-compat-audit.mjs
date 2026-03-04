#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function listDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(dir, d.name));
}

function allSkillDirs() {
  const top = listDirs(path.join(root, 'skills'));
  const packageSkills = [];
  for (const pkg of listDirs(path.join(root, 'packages'))) {
    packageSkills.push(...listDirs(path.join(pkg, 'skills')));
  }
  return [...top, ...packageSkills];
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return null;
  const lines = m[1].split('\n');
  const out = {};
  for (const line of lines) {
    const mm = line.match(/^([a-zA-Z0-9_-]+):\s*(.+)\s*$/);
    if (!mm) continue;
    out[mm[1]] = mm[2].replace(/^"|"$/g, '');
  }
  return out;
}

function resolveSchemaPath(schema, dottedKey) {
  const parts = dottedKey.split('.');
  let cur = schema;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object') return null;
    const props = cur.properties;
    if (!props || typeof props !== 'object' || !Object.prototype.hasOwnProperty.call(props, part)) {
      return null;
    }
    cur = props[part];
  }
  return cur;
}

const report = {
  ok: true,
  plugins: { checked: 0, errors: [], warnings: [] },
  skills: { checked: 0, errors: [], warnings: [] },
};

for (const pluginFile of fs.readdirSync(path.join(root, 'packages')).map((name) => path.join(root, 'packages', name, 'openclaw.plugin.json')).filter((p) => fs.existsSync(p))) {
  report.plugins.checked += 1;
  let manifest;
  try {
    manifest = readJson(pluginFile);
  } catch (err) {
    report.plugins.errors.push(`${pluginFile}: invalid JSON (${String(err)})`);
    continue;
  }

  for (const key of ['id', 'name', 'description', 'version']) {
    if (typeof manifest[key] !== 'string' || !manifest[key].trim()) {
      report.plugins.errors.push(`${pluginFile}: missing/invalid ${key}`);
    }
  }

  if (!manifest.configSchema || typeof manifest.configSchema !== 'object') {
    report.plugins.errors.push(`${pluginFile}: missing configSchema object`);
  } else if (manifest.configSchema.additionalProperties !== false) {
    report.plugins.warnings.push(`${pluginFile}: configSchema.additionalProperties should be false`);
  }

  if (Array.isArray(manifest.skills)) {
    const seen = new Set();
    for (const skillPath of manifest.skills) {
      if (typeof skillPath !== 'string') {
        report.plugins.errors.push(`${pluginFile}: non-string skill entry`);
        continue;
      }
      if (seen.has(skillPath)) {
        report.plugins.warnings.push(`${pluginFile}: duplicate skill path ${skillPath}`);
      }
      seen.add(skillPath);

      const abs = path.resolve(path.dirname(pluginFile), skillPath);
      if (!fs.existsSync(abs)) {
        report.plugins.errors.push(`${pluginFile}: skill path not found ${skillPath}`);
      }
    }
  }

  if (manifest.uiHints && typeof manifest.uiHints === 'object' && manifest.configSchema) {
    for (const key of Object.keys(manifest.uiHints)) {
      if (!resolveSchemaPath(manifest.configSchema, key)) {
        report.plugins.warnings.push(`${pluginFile}: uiHints key '${key}' not found in configSchema path`);
      }
    }
  }
}

for (const dir of allSkillDirs()) {
  report.skills.checked += 1;
  const skillFile = path.join(dir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) {
    report.skills.errors.push(`${dir}: missing SKILL.md`);
    continue;
  }

  const raw = fs.readFileSync(skillFile, 'utf-8');
  const fm = parseFrontmatter(raw);
  if (!fm) {
    report.skills.errors.push(`${skillFile}: missing frontmatter`);
    continue;
  }

  if (!fm.name || !String(fm.name).trim()) {
    report.skills.errors.push(`${skillFile}: frontmatter.name required`);
  }
  if (!fm.description || !String(fm.description).trim()) {
    report.skills.errors.push(`${skillFile}: frontmatter.description required`);
  }

  const lines = raw.split('\n').length;
  if (lines > 500) {
    report.skills.warnings.push(`${skillFile}: ${lines} lines (consider progressive disclosure)`);
  }

  const openaiYaml = path.join(dir, 'agents', 'openai.yaml');
  if (!fs.existsSync(openaiYaml)) {
    report.skills.warnings.push(`${dir}: missing agents/openai.yaml`);
  }
}

if (report.plugins.errors.length || report.skills.errors.length) {
  report.ok = false;
}

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
