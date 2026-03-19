'use strict';

const PHASES = Object.freeze(['extract', 'curate', 'apply', 'verify']);
const LLM_PHASES = Object.freeze(['extract', 'curate']);
const PHASE_TITLES = Object.freeze({
  extract: 'Phase A — extract',
  curate: 'Phase B — curate',
  apply: 'Phase C — apply',
  verify: 'Phase D — verify',
});

function resolvePhases(selectedPhase) {
  if (selectedPhase === 'all') {
    return [...PHASES];
  }

  if (PHASES.includes(selectedPhase)) {
    return [selectedPhase];
  }

  throw new Error(`Invalid pipeline phase: ${selectedPhase}`);
}

function needsLlmRunner(phases) {
  return phases.some((phase) => LLM_PHASES.includes(phase));
}

function phaseTitle(phase) {
  return PHASE_TITLES[phase] || phase;
}

module.exports = {
  PHASES,
  LLM_PHASES,
  PHASE_TITLES,
  resolvePhases,
  needsLlmRunner,
  phaseTitle,
};
