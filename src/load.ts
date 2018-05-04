import * as path from 'path';
import * as fs from 'fs';
import {parse, SliceSource} from 'slice2json';
import {cps} from './utils/cps';

/** @internal */
export interface LoadResult {
  /**
   * Input slice module names which are relative slice paths without `.ice`
   * extension.
   */
  inputNames: string[];
  /**
   * All parsed slices including dependencies.
   */
  slices: LoadedSlices;
}

/** @internal */
export interface LoadedSlices {
  [name: string]: LoadedSlice;
}

/** @internal */
export interface LoadedSlice {
  rootDir: string;
  contents: string;
  parsed: SliceSource;
}

/** @internal */
export async function loadSlices(
  paths: string[],
  absRootDirs: string[],
): Promise<LoadResult> {
  // relative slice path without extension
  const inputNames: string[] = [];

  for (const relativePath of paths) {
    const absPath = path.resolve(relativePath);

    let slicePath: string | null = null;

    for (const rootDir of absRootDirs) {
      if (absPath.startsWith(rootDir + path.sep)) {
        const sliceRelativePath = absPath.substring(rootDir.length + 1);

        if (slicePath == null || slicePath.length > sliceRelativePath.length) {
          slicePath = sliceRelativePath;
        }
      }
    }

    if (slicePath == null) {
      throw new Error(
        `Slice file ${relativePath} is not contained in any of the root dirs`,
      );
    }

    const match = slicePath.match(/^(.*)\.ice$/);

    if (match == null) {
      throw new Error(`Invalid slice file extension: ${slicePath}`);
    }

    inputNames.push(match[1]);
  }

  const loadPromises: {[name: string]: Promise<LoadedSlice>} = {};
  const slices: {[name: string]: LoadedSlice} = {};

  async function loadSliceAndDeps(sliceName: string): Promise<void> {
    if (loadPromises[sliceName] != null) {
      return;
    }

    const promise = (loadPromises[sliceName] = loadSlice(
      `${sliceName}.ice`,
      absRootDirs,
    ));

    const {parsed} = (slices[sliceName] = await promise);

    if (parsed.includes == null) {
      return;
    }

    await Promise.all(parsed.includes.map(loadSliceAndDeps));
  }

  await Promise.all(inputNames.map(loadSliceAndDeps));

  return {inputNames, slices};
}

/**
 * @param slicePath Relative slice path in form `A/B.ice`
 * @param absRootDirs Array of dirs in which to look for slice files.
 */
async function loadSlice(
  slicePath: string,
  absRootDirs: string[],
): Promise<LoadedSlice> {
  let result: {rootDir: string; contents: string} | null = null;

  for (const rootDir of absRootDirs) {
    const absSlicePath = path.join(rootDir, slicePath);
    try {
      result = {
        rootDir,
        contents: await cps<string>(cb =>
          fs.readFile(absSlicePath, 'utf-8', cb),
        ),
      };
      break;
    } catch (e) {
      continue;
    }
  }

  if (result == null) {
    throw new Error(`Failed to load slice file: ${slicePath}`);
  }

  try {
    const {rootDir, contents} = result;
    return {rootDir, contents, parsed: parse(contents)};
  } catch (e) {
    throw new Error(`${slicePath}\n${e.message}`);
  }
}
