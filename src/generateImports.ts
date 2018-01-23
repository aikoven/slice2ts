import {LoadedSlices} from './load';
import * as unixify from 'unixify';

const builtInFolders = new Set([
  'Ice',
  'Glacier2',
  'IceBox',
  'IceBT',
  'IceDiscovery',
  'IceGrid',
  'IceIAP',
  'IceLocatorDiscovery',
  'IcePatch2',
  'IceSSL',
  'IceStorm',
]);

/**
 * Generate ES6 imports for given slice.
 *
 * @internal
 */
export function generateImports(
  sliceName: string,
  slices: LoadedSlices,
  iceImports?: boolean,
): string {
  const {parsed} = slices[sliceName];

  const seenNamespaces = new Set<string>(['Ice']);

  // namespaces that should be imported from "ice"
  const iceNamespaces = new Set<string>(['Ice']);
  // import strings
  const imports: string[] = [];

  const depth = unixify(sliceName).split('/').length;
  let prefix = '';

  for (let i = 0; i < depth - 1; i += 1) {
    prefix += '../';
  }

  for (const name of parsed.includes || []) {
    const namespaces = slices[name].parsed.modules
      .map(module => module.name)
      .filter(namespace => !seenNamespaces.has(namespace));

    for (const namespace of namespaces) {
      seenNamespaces.add(namespace);
    }

    const isBuiltIn = builtInFolders.has(name.split('/')[0]);
    if (!iceImports && isBuiltIn) {
      for (const namespace of namespaces) {
        iceNamespaces.add(namespace);
      }
    } else {
      const importPath = prefix + name;

      const importString =
        namespaces.length > 0
          ? `import { ${namespaces.join(', ')} } from "${importPath}";`
          : `import "${importPath}";`;

      imports.push(importString);
    }
  }

  imports.unshift(`import { ${[...iceNamespaces].join(', ')} } from "ice";`);

  return imports.join('\n') + '\n';
}
