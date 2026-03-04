import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FILES = [
  "IDENTITY.md",
  "MEMORY.md",
  "HEARTBEAT.md",
  "BOOT.md",
  "USER.md",
  "SOUL.md",
  "AGENTS.md",
];

const DEFAULTS: Record<string, string> = {
  "IDENTITY.md": "# {display_name}\n\n- Agent ID: `{agent_id}`\n- Access level: `{access_level}`\n- Domain scopes: `{domain_scopes}`\n",
  "MEMORY.md": "# MEMORY\n\n## Core\n- Agent: `{agent_id}`\n- Access: `{access_level}`\n\n## Local Competence\n- Keep concise lessons and patterns here.\n",
  "HEARTBEAT.md": "# HEARTBEAT\n\n- Default routine: `{default_routines}`\n- Cadence: `{heartbeat_every}`\n",
  "BOOT.md": "# BOOT\n\n1. Validate current task.\n2. Recall relevant memory by scope.\n3. Execute minimal safe step.\n",
  "USER.md": "# USER\n\nTreat user intent as source of truth. Ask only when ambiguity is high-impact.\n",
  "SOUL.md": "# SOUL\n\nOperate with rigor and stable memory hygiene.\n",
  "AGENTS.md": "# AGENTS\n\n- Use assigned access level.\n- Promote only curated facts.\n- Avoid noisy writes to global layers.\n",
};

function render(input: string, vars: Record<string, string>): string {
  let out = input;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, v);
  }
  return out;
}

export function provisionTemplates(params: {
  templatesDir: string;
  agentWorkspace: string;
  vars: Record<string, string>;
}): string[] {
  mkdirSync(params.agentWorkspace, { recursive: true });
  const written: string[] = [];

  for (const file of FILES) {
    const target = join(params.agentWorkspace, file);
    let sourceContent = DEFAULTS[file];
    const sourcePath = join(params.templatesDir, file);
    if (existsSync(sourcePath)) {
      sourceContent = readFileSync(sourcePath, "utf-8");
    }
    const rendered = render(sourceContent, params.vars);
    writeFileSync(target, rendered.endsWith("\n") ? rendered : `${rendered}\n`, "utf-8");
    written.push(target);
  }

  return written;
}
