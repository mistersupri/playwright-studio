export function getRequiredPackages(code: string): string[] {
  if (!code) return [];
  const packages = new Set<string>();
  
  // Match require('pkg') or require("pkg")
  const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
  let match;
  while ((match = requireRegex.exec(code)) !== null) {
    const pkg = match[1];
    if (pkg && !pkg.startsWith(".") && !pkg.startsWith("/") && !pkg.startsWith("node:") && !isBuiltInNodeModule(pkg)) {
      const name = getBasePackageName(pkg);
      if (name) packages.add(name);
    }
  }

  // Match import ... from 'pkg' or import ... from "pkg" or import 'pkg'
  const importRegex = /from\s+['"]([^'"]+)['"]/g;
  while ((match = importRegex.exec(code)) !== null) {
    const pkg = match[1];
    if (pkg && !pkg.startsWith(".") && !pkg.startsWith("/") && !pkg.startsWith("node:") && !isBuiltInNodeModule(pkg)) {
      const name = getBasePackageName(pkg);
      if (name) packages.add(name);
    }
  }

  // Match dynamic import('pkg')
  const dynamicImportRegex = /import\(['"]([^'"]+)['"]\)/g;
  while ((match = dynamicImportRegex.exec(code)) !== null) {
    const pkg = match[1];
    if (pkg && !pkg.startsWith(".") && !pkg.startsWith("/") && !pkg.startsWith("node:") && !isBuiltInNodeModule(pkg)) {
      const name = getBasePackageName(pkg);
      if (name) packages.add(name);
    }
  }

  return Array.from(packages);
}

export function isBuiltInNodeModule(name: string): boolean {
  const builtIns = [
    "fs", "path", "crypto", "os", "child_process", "http", "https", "util", "events", "stream", "assert", "dns", "net", "querystring", "readline", "url", "zlib"
  ];
  return builtIns.includes(name);
}

export function getBasePackageName(importPath: string): string {
  const parts = importPath.split("/");
  if (importPath.startsWith("@")) {
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return importPath;
  }
  return parts[0];
}
