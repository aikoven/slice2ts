import * as commondir from 'commondir';
import {LoadedSlice} from './load';
import * as path from 'path';

/**
 * Path to namespace d.ts file for each top-level Ice module
 * relative to the root dir.
 *
 * E.g. if slices `A/B/C.ice` and `A/D/E.ice` both declare a top-level
 * module `Foo`, its namespace file path will be `A/Foo.ns.d.ts`.
 */
export interface NamespaceFilePaths {
  [module: string]: string;
}

export function getNamespaceFilePaths(
  sliceNames: string[],
  slices: {[name: string]: LoadedSlice},
): NamespaceFilePaths {
  const namespaceUsages: {[module: string]: string[]} = {};

  for (const sliceName of sliceNames) {
    for (const module of slices[sliceName].parsed.modules) {
      const usages =
        namespaceUsages[module.name] || (namespaceUsages[module.name] = []);
      usages.push(path.dirname(sliceName));
    }
  }

  const namespaceFilePaths: NamespaceFilePaths = {};

  for (const module of Object.keys(namespaceUsages)) {
    const namespaceFileDir = commondir('/', namespaceUsages[module]).substr(1);

    namespaceFilePaths[module] = path.join(
      namespaceFileDir,
      `${module}.ns.d.ts`,
    );
  }

  return namespaceFilePaths;
}

export function generateNamespace(module: string) {
  return `export namespace ${module} {}`;
}