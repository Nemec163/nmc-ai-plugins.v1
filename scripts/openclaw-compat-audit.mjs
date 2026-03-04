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
    const rawValue = mm[2].trim();
    if (rawValue.startsWith('{') || rawValue.startsWith('[')) {
      try {
        out[mm[1]] = JSON.parse(rawValue);
        continue;
      } catch {
        out[mm[1]] = rawValue;
        continue;
      }
    }
    out[mm[1]] = rawValue.replace(/^"|"$/g, '');
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

  if (typeof manifest.id !== 'string' || !manifest.id.trim()) {
    report.plugins.errors.push(`${pluginFile}: missing/invalid id`);
  }
  for (const key of ['name', 'description', 'version']) {
    if (typeof manifest[key] !== 'string' || !manifest[key].trim()) {
      report.plugins.warnings.push(`${pluginFile}: missing optional '${key}' (recommended)`);
    }
  }
  if (manifest.kind !== undefined && (typeof manifest.kind !== 'string' || !manifest.kind.trim())) {
    report.plugins.errors.push(`${pluginFile}: invalid kind (must be non-empty string when provided)`);
  }

  if (typeof manifest.source !== 'string' || !manifest.source.trim()) {
    report.plugins.errors.push(`${pluginFile}: missing source`);
  } else {
    const sourcePath = path.resolve(path.dirname(pluginFile), manifest.source);
    if (!fs.existsSync(sourcePath)) {
      report.plugins.errors.push(`${pluginFile}: source path not found ${manifest.source}`);
    }
  }

  const legacyConfigSchema = manifest.configSchema && typeof manifest.configSchema === 'object'
    ? manifest.configSchema
    : null;
  const configObj = manifest.config && typeof manifest.config === 'object' && !Array.isArray(manifest.config)
    ? manifest.config
    : null;
  const nestedConfigSchema = configObj && configObj.schema && typeof configObj.schema === 'object'
    ? configObj.schema
    : null;
  const effectiveConfigSchema = nestedConfigSchema || legacyConfigSchema;
  if (!effectiveConfigSchema) {
    report.plugins.errors.push(`${pluginFile}: missing config schema (config.schema or configSchema)`);
  } else if (effectiveConfigSchema.additionalProperties !== false) {
    report.plugins.warnings.push(`${pluginFile}: config schema additionalProperties should be false`);
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

  const legacyUiHints = manifest.uiHints && typeof manifest.uiHints === 'object' ? manifest.uiHints : null;
  const nestedUiHints = configObj && configObj.uiHints && typeof configObj.uiHints === 'object'
    ? configObj.uiHints
    : null;
  const effectiveUiHints = nestedUiHints || legacyUiHints;

  if (effectiveUiHints && effectiveConfigSchema) {
    for (const key of Object.keys(effectiveUiHints)) {
      if (!resolveSchemaPath(effectiveConfigSchema, key)) {
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
  if (Object.prototype.hasOwnProperty.call(fm, 'metadata')) {
    const metadata = fm.metadata;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      report.skills.errors.push(`${skillFile}: frontmatter.metadata must be JSON object on one line`);
    } else {
      const openclaw = metadata.openclaw;
      if (openclaw !== undefined && (!openclaw || typeof openclaw !== 'object' || Array.isArray(openclaw))) {
        report.skills.errors.push(`${skillFile}: metadata.openclaw must be object`);
      } else if (openclaw && typeof openclaw === 'object') {
        const requires = openclaw.requires;
        if (requires !== undefined && (!requires || typeof requires !== 'object' || Array.isArray(requires))) {
          report.skills.errors.push(`${skillFile}: metadata.openclaw.requires must be object`);
        } else if (requires && typeof requires === 'object') {
          for (const key of ['config', 'anyBins', 'anyFiles']) {
            if (requires[key] !== undefined) {
              if (!Array.isArray(requires[key]) || requires[key].some((v) => typeof v !== 'string' || !v.trim())) {
                report.skills.errors.push(`${skillFile}: metadata.openclaw.requires.${key} must be string[]`);
              }
            }
          }
        }
      }
    }
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
