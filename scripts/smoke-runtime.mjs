#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

function run(args) {
  try {
    const out = execFileSync('openclaw', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out: out.trim() };
  } catch (err) {
    return {
      ok: false,
      out: String(err?.stdout ?? ''),
      err: String(err?.stderr ?? err?.message ?? err),
    };
  }
}

const checks = {
  memDoctor: run(['nmc-mem', 'doctor', '--json']),
  memCatalog: run(['nmc-mem', 'catalog', '--principal', 'system:auto-recall', '--json']),
  memGrants: run(['nmc-mem', 'grants', '--principal', 'system:auto-recall', '--target', 'system:auto-recall', '--json']),
  memQuality: run(['nmc-mem', 'quality', '--json']),
  agentDoctor: run(['nmc-agent', 'doctor', '--json']),
  opsHealth: run(['nmc-ops', 'health', '--json']),
  opsHeartbeat: run(['nmc-ops', 'heartbeat', '--json']),
};

const report = {
  ok:
    checks.memDoctor.ok &&
    checks.memCatalog.ok &&
    checks.memGrants.ok &&
    checks.memQuality.ok &&
    checks.agentDoctor.ok &&
    checks.opsHealth.ok &&
    checks.opsHeartbeat.ok,
  checks,
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
