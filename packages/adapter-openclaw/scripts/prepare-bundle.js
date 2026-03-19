#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const PACKAGES_ROOT = path.resolve(PACKAGE_ROOT, "..");

const BUNDLED_PACKAGES = Object.freeze([
  "control-plane",
  "memory-agents",
  "memory-canon",
  "memory-contracts",
  "memory-maintainer",
  "memory-os-gateway",
  "memory-os-runtime",
  "memory-pipeline",
  "memory-scripts",
  "memory-workspace",
]);

const GENERATED_ROOTS = Object.freeze(["bin", ...BUNDLED_PACKAGES]);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function copyEntry(sourceRoot, targetRoot, relativePath) {
  const sourcePath = path.join(sourceRoot, relativePath);
  const targetPath = path.join(targetRoot, relativePath);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing bundle source entry: ${sourcePath}`);
  }

  ensureDir(path.dirname(targetPath));
  fs.cpSync(sourcePath, targetPath, {
    recursive: true,
    force: true,
  });
}

function bundlePackage(packageDirName) {
  const sourceRoot = path.join(PACKAGES_ROOT, packageDirName);
  const targetRoot = path.join(PACKAGE_ROOT, packageDirName);
  const manifest = readJson(path.join(sourceRoot, "package.json"));
  const fileEntries = Array.isArray(manifest.files) ? manifest.files : [];

  ensureDir(targetRoot);
  copyEntry(sourceRoot, targetRoot, "package.json");

  for (const entry of fileEntries) {
    copyEntry(sourceRoot, targetRoot, entry);
  }
}

function writeExecutable(relativePath, contents) {
  const targetPath = path.join(PACKAGE_ROOT, relativePath);
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, contents, "utf8");
  fs.chmodSync(targetPath, 0o755);
}

function cleanBundle() {
  for (const relativePath of GENERATED_ROOTS) {
    fs.rmSync(path.join(PACKAGE_ROOT, relativePath), {
      recursive: true,
      force: true,
    });
  }
}

function buildBundle() {
  cleanBundle();

  for (const packageDirName of BUNDLED_PACKAGES) {
    bundlePackage(packageDirName);
  }

  writeExecutable(
    path.join("bin", "memory-control-plane.js"),
    [
      "#!/usr/bin/env node",
      "'use strict';",
      "",
      "require('../control-plane/bin/memory-control-plane.js');",
      "",
    ].join("\n")
  );

  writeExecutable(
    path.join("bin", "memory-os-gateway.js"),
    [
      "#!/usr/bin/env node",
      "'use strict';",
      "",
      "require('../memory-os-gateway/bin/memory-os-gateway.js');",
      "",
    ].join("\n")
  );
}

function main(argv) {
  const command = argv[0];

  if (command === "build") {
    buildBundle();
    return;
  }

  if (command === "clean") {
    cleanBundle();
    return;
  }

  throw new Error("Usage: prepare-bundle.js <build|clean>");
}

main(process.argv.slice(2));
