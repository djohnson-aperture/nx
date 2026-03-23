import { offsetFromRoot, Tree, updateJson, workspaceRoot } from '@nx/devkit';
import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import type * as ts from 'typescript';
import { ensureTypescript } from './ensure-typescript';

let tsModule: typeof import('typescript');

export function readTsConfig(
  tsConfigPath: string,
  sys?: ts.System
): ts.ParsedCommandLine {
  if (!tsModule) {
    tsModule = require('typescript');
  }

  sys ??= tsModule.sys;

  const readResult = tsModule.readConfigFile(tsConfigPath, sys.readFile);
  return tsModule.parseJsonConfigFileContent(
    readResult.config,
    sys,
    dirname(tsConfigPath)
  );
}

export function readTsConfigFromTree(
  tree: Tree,
  tsConfigPath: string
): ts.ParsedCommandLine {
  if (!tsModule) {
    tsModule = ensureTypescript();
  }

  const tsSysFromTree: ts.System = {
    ...tsModule.sys,
    readFile: (path) => tree.read(path, 'utf-8'),
  };

  return readTsConfig(tsConfigPath, tsSysFromTree);
}

export function getRootTsConfigPathInTree(tree: Tree): string | null {
  for (const path of ['tsconfig.base.json', 'tsconfig.json']) {
    if (tree.exists(path)) {
      return path;
    }
  }

  return 'tsconfig.base.json';
}

export function getRelativePathToRootTsConfig(
  tree: Tree,
  targetPath: string
): string {
  return offsetFromRoot(targetPath) + getRootTsConfigPathInTree(tree);
}

export function getRootTsConfigPath(): string | null {
  const tsConfigFileName = getRootTsConfigFileName();

  return tsConfigFileName ? join(workspaceRoot, tsConfigFileName) : null;
}

export function getRootTsConfigFileName(tree?: Tree): string | null {
  for (const tsConfigName of ['tsconfig.base.json', 'tsconfig.json']) {
    const pathExists = tree
      ? tree.exists(tsConfigName)
      : existsSync(join(workspaceRoot, tsConfigName));

    if (pathExists) {
      return tsConfigName;
    }
  }

  return null;
}

export function addTsConfigPath(
  tree: Tree,
  importPath: string,
  lookupPaths: string[]
) {
  updateJson(tree, getRootTsConfigPathInTree(tree), (json) => {
    json.compilerOptions ??= {};
    const c = json.compilerOptions;
    c.paths ??= {};

    if (c.paths[importPath]) {
      throw new Error(
        `You already have a library using the import path "${importPath}". Make sure to specify a unique one.`
      );
    }

    c.paths[importPath] = lookupPaths.map(ensureRelativePath);

    return json;
  });
}

function ensureRelativePath(p: string): string {
  if (p.startsWith('./') || p.startsWith('../') || p.startsWith('/')) {
    return p;
  }
  return `./${p}`;
}

/**
 * When `baseUrl` is not set and `paths` are inherited via `extends`,
 * tools like `tsconfig-paths` resolve from the loaded file's directory
 * instead of the file where `paths` is defined. This walks the `extends`
 * chain to find the correct resolution base.
 *
 * Returns `undefined` when `baseUrl` is set (the tools handle it correctly
 * on their own), or the directory of the tsconfig that defines `paths`.
 */
export function resolvePathsBaseUrl(tsconfigPath: string): string | undefined {
  return walkTsConfigChain(tsconfigPath, false);
}

function walkTsConfigChain(
  tsconfigPath: string,
  foundBaseUrl: boolean
): string | undefined {
  const absolute = resolve(tsconfigPath);
  const dir = dirname(absolute);
  try {
    const raw = JSON.parse(readFileSync(absolute, 'utf-8'));
    if (raw.compilerOptions?.baseUrl) {
      foundBaseUrl = true;
    }
    if (
      raw.compilerOptions?.paths &&
      Object.keys(raw.compilerOptions.paths).length > 0
    ) {
      return foundBaseUrl ? undefined : dir;
    }
    if (raw.extends) {
      return walkTsConfigChain(resolve(dir, raw.extends), foundBaseUrl);
    }
  } catch {}
  return foundBaseUrl ? undefined : dir;
}

export function readTsConfigPaths(tsConfig?: string | ts.ParsedCommandLine) {
  tsConfig ??= getRootTsConfigPath();
  try {
    if (!tsModule) {
      tsModule = ensureTypescript();
    }

    let config: ts.ParsedCommandLine;

    if (typeof tsConfig === 'string') {
      const configFile = tsModule.readConfigFile(
        tsConfig,
        tsModule.sys.readFile
      );
      config = tsModule.parseJsonConfigFileContent(
        configFile.config,
        tsModule.sys,
        dirname(tsConfig)
      );
    } else {
      config = tsConfig;
    }
    if (config.options?.paths) {
      return config.options.paths;
    } else {
      return null;
    }
  } catch (e) {
    return null;
  }
}
