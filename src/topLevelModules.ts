import * as commondir from 'commondir';
import * as unixify from 'unixify';
import * as path from 'path';
import {LoadedSlices} from './load';
import {escape} from './escape';

/**
 * Slice names for each top-level Ice module.
 *
 * @internal
 */
export function getTopLevelModules(
  sliceNames: string[],
  slices: LoadedSlices,
): {[module: string]: string[]} {
  const namespaceUsages: {[module: string]: string[]} = {};

  for (const sliceName of sliceNames) {
    for (const module of slices[sliceName].parsed.modules) {
      const usages =
        namespaceUsages[module.name] || (namespaceUsages[module.name] = []);
      usages.push(sliceName);
    }
  }

  return namespaceUsages;
}

/**
 * Path to namespace d.ts file for each top-level Ice module
 * relative to the root dir.
 *
 * E.g. if slices `A/B/C.ice` and `A/D/E.ice` both declare a top-level
 * module `Foo`, its namespace file path will be `A/Foo.ns.d.ts`.
 *
 * @internal
 */
export interface NamespaceFilePaths {
  [module: string]: string;
}

/** @internal */
export function getNamespaceFilePaths(namespaceUsages: {
  [module: string]: string[];
}): NamespaceFilePaths {
  const namespaceFilePaths: NamespaceFilePaths = {};

  for (const module of Object.keys(namespaceUsages)) {
    const namespaceFileDir = unixify(commondir(
      '/',
      namespaceUsages[module].map(sliceName => path.dirname(sliceName)),
    )).substr(1);

    namespaceFilePaths[module] = path.posix.join(
      namespaceFileDir,
      `${module}.ns.d.ts`,
    );
  }

  return namespaceFilePaths;
}

/** @internal */
export function generateNamespace(module: string) {
  return `export namespace ${escape(module)} {}`;
}
