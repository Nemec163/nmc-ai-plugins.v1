#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const getArg = (name, fallback = '') => {
  const i = args.indexOf(name);
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  return fallback;
};

const home = os.homedir();
const configPath = path.resolve(
  getArg('--config', process.env.OPENCLAW_CONFIG_PATH || path.join(home, '.openclaw', 'openclaw.json')),
);
const skillsDir = path.resolve(
  getArg('--skills-dir', process.env.NMC_AI_PLUGINS_SKILLS_DIR || path.join(home, '.openclaw', 'skills', 'nmc-ai-plugins')),
);
const stateDir = path.resolve(getArg('--state-dir', process.env.NMC_AI_PLUGINS_STATE_DIR || path.join(home, '.openclaw', 'nmc-ai-plugins')));
const templatesDir = path.resolve(getArg('--templates-dir', process.env.NMC_AI_PLUGINS_TEMPLATES_DIR || path.join(home, '.openclaw', 'nmc-ai-plugins', 'templates', 'agent-md')));

if (!fs.existsSync(configPath)) {
  console.error(`openclaw.json not found: ${configPath}`);
  process.exit(2);
}

const raw = fs.readFileSync(configPath, 'utf-8');
const cfg = JSON.parse(raw);

const backupPath = `${configPath}.bak.${Date.now()}`;
fs.writeFileSync(backupPath, raw, 'utf-8');

function discoverablePluginIds() {
  const ids = new Set();
  const commands = [
    ['plugins', 'list', '--json'],
    ['plugins', 'list'],
  ];
  for (const cmd of commands) {
    try {
      const out = execFileSync('openclaw', cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
      try {
        const parsed = JSON.parse(out);
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
      } catch {
        for (const id of ['nmc-memory-fabric', 'nmc-agent-lifecycle', 'nmc-control-plane']) {
          if (out.toLowerCase().includes(id)) ids.add(id);
        }
      }
      if (ids.size > 0) break;
    } catch {}
  }
  return ids;
}

const discoverableIds = discoverablePluginIds();

const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

cfg.memory ??= {};
cfg.memory.backend = 'qmd';
cfg.memory.qmd ??= {};
const qmdPaths = new Set(Array.isArray(cfg.memory.qmd.paths) ? cfg.memory.qmd.paths : []);
for (const p of ['system/docs', 'system/policy', 'system/tasks', 'system/skills', 'nmc/research', '.']) {
  qmdPaths.add(p);
}
cfg.memory.qmd.paths = [...qmdPaths];

const qmdExclude = new Set(Array.isArray(cfg.memory.qmd.exclude) ? cfg.memory.qmd.exclude : []);
for (const pattern of ['**/.git/**', '**/node_modules/**', '**/dist/**', '**/.next/**']) {
  qmdExclude.add(pattern);
}
cfg.memory.qmd.exclude = [...qmdExclude];

cfg.skills ??= {};
cfg.skills.load ??= {};
cfg.skills.load.extraDirs ??= [];
if (!cfg.skills.load.extraDirs.includes(skillsDir)) {
  cfg.skills.load.extraDirs.push(skillsDir);
}

cfg.plugins ??= {};
cfg.plugins.slots ??= {};
cfg.plugins.entries = asObject(cfg.plugins.entries);
const pluginEntries = cfg.plugins.entries;

if (discoverableIds.has('nmc-memory-fabric')) {
  cfg.plugins.slots.memory = 'nmc-memory-fabric';
  const existingEntry = asObject(pluginEntries['nmc-memory-fabric']);
  const existingConfig = asObject(existingEntry.config);
  pluginEntries['nmc-memory-fabric'] = {
    ...existingEntry,
    enabled: true,
    config: {
      ...existingConfig,
      stateDir,
      autoRecall: true,
      autoCapture: true,
      autoRecallPrincipal: 'system:auto-recall',
      autoRecallActorLevel: 'A4_orchestrator_full',
      autoRecallLayers: ['M1_local', 'M2_domain', 'M4_global_facts'],
      autoRecallMaxContextChars: 1800,
      autoRecallMaxItems: 5,
      autoRecallMinScore: 0.45,
      autoCaptureMaxPerRun: 3,
      recallMinScore: 0.32,
      maxFactChars: 1200,
      bootstrapAclEnabled: true,
      bootstrapAdminPrincipal: 'orchestrator',
      bootstrapAdminActorLevel: 'A4_orchestrator_full',
      bootstrapScopes: ['global'],
      embedding: {
        apiKey: '${OPENAI_API_KEY}',
        model: 'text-embedding-3-small',
      },
      qmd: {
        enabled: true,
        paths: cfg.memory.qmd.paths.map((p) =>
          p === '.'
            ? path.join(path.dirname(configPath), 'workspace')
            : path.join(path.dirname(configPath), 'workspace', p),
        ),
        exclude: cfg.memory.qmd.exclude,
      },
    },
  };
}

if (discoverableIds.has('nmc-agent-lifecycle')) {
  const existingEntry = asObject(pluginEntries['nmc-agent-lifecycle']);
  const existingConfig = asObject(existingEntry.config);
  pluginEntries['nmc-agent-lifecycle'] = {
    ...existingEntry,
    enabled: true,
    config: {
      ...existingConfig,
      stateDir,
      openclawConfigPath: configPath,
      workspaceRoot: path.join(path.dirname(configPath), 'workspace'),
      templatesDir,
    },
  };
}

if (discoverableIds.has('nmc-control-plane')) {
  const existingEntry = asObject(pluginEntries['nmc-control-plane']);
  const existingConfig = asObject(existingEntry.config);
  pluginEntries['nmc-control-plane'] = {
    ...existingEntry,
    enabled: true,
    config: {
      ...existingConfig,
      host: '127.0.0.1',
      port: 4466,
      apiTokenEnv: 'NMC_AI_PLUGINS_API_TOKEN',
      mutationTokenEnv: 'NMC_AI_PLUGINS_MUTATION_TOKEN',
      allowMutations: false,
    },
  };
}

cfg.agents ??= {};
cfg.agents.defaults ??= {};
cfg.agents.defaults.toolsAllowlist ??= [];
const baselineTools = [
  'nmc_memory_bootstrap',
  'nmc_memory_plan',
  'nmc_memory_access_profile',
  'nmc_memory_catalog',
  'nmc_memory_layers',
  'nmc_memory_recall',
  'nmc_memory_store',
  'nmc_memory_promote',
  'nmc_memory_promote_decide',
  'nmc_memory_prune',
  'nmc_memory_stats',
  'nmc_memory_quality',
  'nmc_memory_principals',
  'nmc_memory_grants',
  'nmc_memory_grant_set',
  'nmc_memory_grant_delete',
  'nmc_memory_conflicts',
  'nmc_memory_conflict_resolve',
  'nmc_agent_list',
  'nmc_ops_health',
  'nmc_ops_heartbeat',
];
for (const t of baselineTools) {
  if (!cfg.agents.defaults.toolsAllowlist.includes(t)) {
    cfg.agents.defaults.toolsAllowlist.push(t);
  }
}

fs.writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`, 'utf-8');

console.log(JSON.stringify({
  ok: true,
  configPath,
  backupPath,
  skillsDir,
  stateDir,
  templatesDir,
  configuredMemorySlot: discoverableIds.has('nmc-memory-fabric') ? 'nmc-memory-fabric' : null,
  discoverablePluginIds: [...discoverableIds],
}, null, 2));
