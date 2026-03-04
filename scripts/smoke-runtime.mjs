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
  agentDoctor: run(['nmc-agent', 'doctor', '--json']),
  opsHealth: run(['nmc-ops', 'health', '--json']),
};

const report = {
  ok: checks.memDoctor.ok && checks.agentDoctor.ok && checks.opsHealth.ok,
  checks,
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
