import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as uuid from 'uuid';
import * as babel from 'babel-core';
import {compile as slice2js} from 'slice2js';
import * as escapeRegexp from 'escape-string-regexp';
import {cps} from './utils/cps';
import {LoadedSlices, LoadedSlice} from './load';
import {generateImports} from './generateImports';

/** @internal */
export async function generateJs(
  sliceName: string,
  slices: LoadedSlices,
  absRootDirs: string[],
  modules: 'cjs' | 'esm'
): Promise<string> {
  let compiled = await compileSliceWithEs6(
    sliceName,
    slices[sliceName],
    absRootDirs,
  );

  // rewrite imports
  compiled =
    generateImports(sliceName, slices) + compiled.replace(importRegex, '');

  // transform imports to require
  if (modules === 'cjs') {
    compiled = babel.transform(compiled, {
      babelrc: false,
      plugins: [
        [
          require.resolve('babel-plugin-transform-es2015-modules-commonjs'),
          {noInterop: true},
        ],
      ],
    }).code!;
  }

  return compiled;
}

const importRegex = /(^import.*\r?\n)+/gm;

const es6Meta = `[["js:es6-module"]]\n`;

/**
 * Copy slice contents to a temporary file with added metadata to produce
 * ES6 modules and then compile it.
 */
async function compileSliceWithEs6(
  sliceName: string,
  slice: LoadedSlice,
  absRootDirs: string[],
): Promise<string> {
  const uniqueName = uuid.v4();
  const tempSlicePath = path.join(os.tmpdir(), `${uniqueName}.ice`);

  await cps(cb => fs.writeFile(tempSlicePath, es6Meta + slice.contents, cb));

  try {
    const source = await compileSliceRaw(tempSlicePath, absRootDirs);
    return source
      .replace(path.basename(tempSlicePath), `${sliceName}.ice`)
      .replace(uniqueName, sliceName);
  } catch (e) {
    if (typeof e === 'string') {
      throw e.replace(
        new RegExp(`^.*${escapeRegexp(tempSlicePath)}:(\\d+)`, 'gm'),
        (match, lineNumber) => `${sliceName}.ice:${+lineNumber - 1}`,
      );
    }

    throw e;
  } finally {
    await cps(cb => fs.unlink(tempSlicePath, cb));
  }
}

/**
 * Compile slice file using `slice2js` and return generated source.
 */
function compileSliceRaw(
  slicePath: string,
  absRootDirs: string[],
): Promise<string> {
  const child = slice2js([
    ...absRootDirs.map(path => `-I${path}`),
    '--stdout',
    slicePath,
  ]);

  let source = '';
  let error = '';

  child.stdout!.on('data', data => {
    source += data.toString();
  });
  child.stderr!.on('data', data => {
    error += data.toString();
  });

  return new Promise<string>((resolve, reject) => {
    child.on('close', code => {
      if (code !== 0) {
        return reject(error);
      }

      resolve(source);
    });
  });
}
