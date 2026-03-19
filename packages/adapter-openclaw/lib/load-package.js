"use strict";

const fs = require("node:fs");
const path = require("node:path");

function loadPackage(primaryName, fallbackPaths) {
  try {
    return require(primaryName);
  } catch (error) {
    if (
      error.code !== "MODULE_NOT_FOUND" ||
      !String(error.message || "").includes(primaryName)
    ) {
      throw error;
    }
  }

  for (const fallbackPath of fallbackPaths) {
    try {
      return require(fallbackPath);
    } catch (error) {
      if (
        error.code === "MODULE_NOT_FOUND" &&
        String(error.message || "").includes(fallbackPath)
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Cannot resolve package: ${primaryName}`);
}

function resolvePackagePath(packageDirName, ...relativePath) {
  const candidateRoots = [
    path.resolve(__dirname, "..", packageDirName),
    path.resolve(__dirname, "..", "..", packageDirName),
  ];

  for (const candidateRoot of candidateRoots) {
    const candidatePath = path.join(candidateRoot, ...relativePath);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return path.join(candidateRoots[0], ...relativePath);
}

module.exports = {
  loadPackage,
  resolvePackagePath,
};
