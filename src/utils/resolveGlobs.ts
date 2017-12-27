import * as glob from 'glob';
import {cps} from './cps';

/** @internal */
export async function resolveGlobs(
  globs: string[],
  ignore?: string[],
): Promise<string[]> {
  const results = await Promise.all(
    globs.map(pattern => cps<string[]>(cb => glob(pattern, {ignore}, cb))),
  );

  const paths = new Set<string>();

  for (const result of results) {
    for (const path of result) {
      paths.add(path);
    }
  }

  return [...paths];
}
