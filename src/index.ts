import * as path from 'path';
import * as fs from 'fs';
import * as mkdirp from 'mkdirp';
import {sliceDir} from 'slice2js';

import {resolveGlobs} from './utils/resolveGlobs';
import {loadSlices} from './load';
import {getNamespaceFilePaths, generateNamespace} from './namespaceFilePaths';
import {generateTypings} from './generateTypings';
import {generateJs} from './generateJs';
import {cps} from './utils/cps';
import {createTypeScope} from './typeScope';

export interface Slice2TsOptions {
  /**
   * Array of slice file paths or globs.
   */
  files: string[];
  /**
   * Array of file paths or globs to exclude.
   */
  exclude?: string[];
  /**
   * Array of root dirs.
   * Output files will have the same structure as source files relative to root
   * dirs.
   * Ice includes are also resolved in these dirs.
   */
  rootDirs: string[];
  /**
   * Directory where to put generated files.
   */
  outDir: string;
  /**
   * If true, only typings are generated.
   */
  noJs?: boolean;
  /**
   * If true, Ice modules are imported from particular files instead of "ice".
   */
  iceImports?: boolean;
  /**
   * Don't generate typings for these types.
   */
  ignore?: string[];
}

export async function slice2ts(options: Slice2TsOptions) {
  const paths = await resolveGlobs(options.files, options.exclude);

  const absRootDirs = options.rootDirs.map(dir => path.resolve(dir));
  absRootDirs.push(sliceDir);

  const {inputNames, slices} = await loadSlices(paths, absRootDirs);

  const namespaceFilePaths = getNamespaceFilePaths(inputNames, slices);
  const typeScope = createTypeScope(slices);

  for (const module of Object.keys(namespaceFilePaths)) {
    await writeFile(
      path.join(options.outDir, namespaceFilePaths[module]),
      generateNamespace(module),
    );
  }

  for (const name of inputNames) {
    const basename = path.join(options.outDir, name);

    if (!options.noJs) {
      await writeFile(
        `${basename}.js`,
        await generateJs(name, slices, absRootDirs),
      );
    }

    await writeFile(
      `${basename}.d.ts`,
      generateTypings(
        typeScope,
        name,
        slices,
        namespaceFilePaths,
        options.ignore || [],
        options.iceImports || false,
      ),
    );
  }
}

async function writeFile(filePath: string, content: string): Promise<void> {
  await cps(cb => mkdirp(path.dirname(filePath), cb));
  await cps(cb => fs.writeFile(filePath, content, 'utf-8', cb));
}
