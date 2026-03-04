#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const PLUGIN_IDS = ['nmc-memory-fabric', 'nmc-agent-lifecycle', 'nmc-control-plane'];
const configPath = process.env.OPENCLAW_CONFIG_PATH || path.join(os.homedir(), '.openclaw', 'openclaw.json');

function runOpenClaw(args) {
  try {
    const out = execFileSync('openclaw', args, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      maxBuffer: 8 * 1024 * 1024,
    });
    return { ok: true, out: out.trim(), err: '' };
  } catch (err) {
    return {
      ok: false,
      out: String(err?.stdout ?? '').trim(),
      err: String(err?.stderr ?? err?.message ?? err).trim(),
    };
  }
}

function parseListedPluginIds(listOutput) {
  const ids = new Set();
  if (!listOutput || typeof listOutput !== 'string') return ids;

  try {
    const parsed = JSON.parse(listOutput);
    const rows = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.plugins)
        ? parsed.plugins
        : Array.isArray(parsed.items)
          ? parsed.items
          : [];
    for (const row of rows) {
      if (row && typeof row === 'object' && typeof row.id === 'string') {
        ids.add(row.id);
      }
    }
    return ids;
  } catch {}

  const lowered = listOutput.toLowerCase();
  for (const id of PLUGIN_IDS) {
    if (lowered.includes(id.toLowerCase())) {
      ids.add(id);
    }
  }
  return ids;
}

const checks = {
  openclawAvailable: true,
  configExists: fs.existsSync(configPath),
  pluginsListed: {},
  pluginList: null,
  doctor: null,
};

const pluginList = runOpenClaw(['plugins', 'list', '--json']);
const pluginListFallback = pluginList.ok ? null : runOpenClaw(['plugins', 'list']);
const pluginListResult = pluginList.ok ? pluginList : pluginListFallback;
checks.pluginList = pluginListResult;
checks.openclawAvailable = Boolean(
  pluginListResult?.ok ||
    !/ENOENT|not found|No such file/i.test(String(pluginListResult?.err ?? "")),
);

const discovered = parseListedPluginIds(`${pluginListResult?.out ?? ''}\n${pluginListResult?.err ?? ''}`);
for (const id of PLUGIN_IDS) {
  checks.pluginsListed[id] = discovered.has(id);
}

checks.doctor = runOpenClaw(['plugins', 'doctor']);

let memoryConfigOk = false;
let memorySlotOk = false;
if (checks.configExists) {
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  memoryConfigOk = cfg?.memory?.backend === 'qmd';
  memorySlotOk = cfg?.plugins?.slots?.memory === 'nmc-memory-fabric';
}

const pluginsDiscovered = Object.values(checks.pluginsListed).every(Boolean);
const doctorOk = checks.doctor.ok;

const report = {
  ok: checks.configExists && memoryConfigOk && memorySlotOk && pluginsDiscovered && doctorOk,
  checks,
  memoryConfigOk,
  memorySlotOk,
  pluginsDiscovered,
  doctorOk,
  configPath,
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
