'use strict';

const fs = require('fs');
const path = require('path');
const { ensureDir, listFilesRecursive } = require('./fs-helpers');

function replaceTemplatePlaceholders(content, installDate) {
  return content
    .replaceAll('{{INSTALL_DATE}}', installDate)
    .replaceAll('"INSTALL_DATE"', `"${installDate}"`);
}

function copyTemplateTree(templateRoot, targetRoot, overwrite, installDate) {
  const files = listFilesRecursive(templateRoot);
  const created = [];

  for (const sourcePath of files) {
    const relativePath = path.relative(templateRoot, sourcePath);
    const targetPath = path.join(targetRoot, relativePath);
    const sourceBuffer = fs.readFileSync(sourcePath);
    const isText =
      relativePath.endsWith('.md') ||
      relativePath.endsWith('.json') ||
      relativePath.endsWith('.jsonl') ||
      relativePath.endsWith('.js') ||
      relativePath.endsWith('.mjs') ||
      relativePath.endsWith('.sh') ||
      path.basename(relativePath).startsWith('.');
    const content = isText
      ? replaceTemplatePlaceholders(sourceBuffer.toString('utf8'), installDate)
      : sourceBuffer;

    if (!overwrite && fs.existsSync(targetPath)) {
      continue;
    }

    ensureDir(path.dirname(targetPath));
    fs.writeFileSync(targetPath, content);
    fs.chmodSync(targetPath, fs.statSync(sourcePath).mode);
    created.push(targetPath);
  }

  return created;
}

module.exports = {
  replaceTemplatePlaceholders,
  copyTemplateTree,
};
