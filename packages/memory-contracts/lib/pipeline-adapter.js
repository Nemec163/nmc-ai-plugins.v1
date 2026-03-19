'use strict';

const PIPELINE_ADAPTER_PHASES = Object.freeze(['extract', 'curate']);
const PIPELINE_ADAPTER_METHODS = Object.freeze({
  extract: 'runExtract',
  curate: 'runCurate',
});

function buildIssue(code, message, path) {
  return {
    code,
    message,
    path,
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function getPipelineAdapterMethod(phase) {
  const method = PIPELINE_ADAPTER_METHODS[phase];
  if (!method) {
    throw new Error(`Unsupported pipeline adapter phase: ${phase}`);
  }

  return method;
}

function validatePipelineAdapter(adapter) {
  const issues = [];

  if (!isPlainObject(adapter)) {
    return {
      valid: false,
      issues: [
        buildIssue(
          'invalid-shape',
          'Pipeline adapter must be an object.',
          'adapter'
        ),
      ],
    };
  }

  for (const phase of PIPELINE_ADAPTER_PHASES) {
    const method = getPipelineAdapterMethod(phase);
    if (typeof adapter[method] !== 'function') {
      issues.push(
        buildIssue(
          'missing-method',
          `Pipeline adapter must expose ${method}().`,
          method
        )
      );
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

function validatePipelineInvocation(invocation) {
  const issues = [];

  if (!isPlainObject(invocation)) {
    return {
      valid: false,
      issues: [
        buildIssue(
          'invalid-shape',
          'Pipeline invocation must be an object.',
          'invocation'
        ),
      ],
    };
  }

  if (!isNonEmptyString(invocation.command)) {
    issues.push(
      buildIssue(
        'invalid-value',
        'command must be a non-empty string.',
        'command'
      )
    );
  }

  if (!Array.isArray(invocation.args)) {
    issues.push(
      buildIssue(
        'invalid-value',
        'args must be an array.',
        'args'
      )
    );
  } else if (!invocation.args.every(isNonEmptyString)) {
    issues.push(
      buildIssue(
        'invalid-value',
        'args entries must be non-empty strings.',
        'args'
      )
    );
  }

  if (
    invocation.displayCommand != null &&
    !isNonEmptyString(invocation.displayCommand)
  ) {
    issues.push(
      buildIssue(
        'invalid-value',
        'displayCommand must be a non-empty string when provided.',
        'displayCommand'
      )
    );
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

function getPipelineInvocation(adapter, phase, options) {
  const adapterValidation = validatePipelineAdapter(adapter);
  if (!adapterValidation.valid) {
    throw new Error(
      adapterValidation.issues.map((issue) => issue.message).join(' ')
    );
  }

  const invocation = adapter[getPipelineAdapterMethod(phase)](options || {});
  const invocationValidation = validatePipelineInvocation(invocation);
  if (!invocationValidation.valid) {
    throw new Error(
      invocationValidation.issues.map((issue) => issue.message).join(' ')
    );
  }

  return invocation;
}

function formatPipelineInvocation(invocation) {
  if (isNonEmptyString(invocation && invocation.displayCommand)) {
    return invocation.displayCommand;
  }

  return [invocation.command, ...(invocation.args || [])].join(' ');
}

module.exports = {
  PIPELINE_ADAPTER_METHODS,
  PIPELINE_ADAPTER_PHASES,
  formatPipelineInvocation,
  getPipelineAdapterMethod,
  getPipelineInvocation,
  validatePipelineAdapter,
  validatePipelineInvocation,
};
