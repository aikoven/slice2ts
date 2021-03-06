import * as path from 'path';
import {resolveGlobs} from './utils/resolveGlobs';
import {loadSlices} from './load';
import {getNamespaceFilePaths, getTopLevelModules} from './topLevelModules';
import {createTypeScope} from './typeScope';
import {generateTypings} from './generateTypings';

jest.setTimeout(30000);

async function testOutput(sliceDir: string, globs: string[]) {
  const paths = await resolveGlobs(globs);

  const {inputNames, slices} = await loadSlices(paths, [
    path.resolve(sliceDir),
  ]);

  const topLevelModules = getTopLevelModules(inputNames, slices);

  const namespaceFilePaths = getNamespaceFilePaths(topLevelModules);
  const typeScope = createTypeScope(slices);

  for (const name of inputNames) {
    const typings = await generateTypings(
      typeScope,
      name,
      slices,
      namespaceFilePaths,
      [],
      true,
      false,
    );
    expect(typings).toMatchSnapshot(name);
  }
}

describe('generate typings', () => {
  test('built-in slices', () => {
    const sliceDir = 'node_modules/slice2js/ice/slice';
    return testOutput(sliceDir, [`${sliceDir}/**/*.ice`]);
  });

  test('module shadowing', () => {
    const sliceDir = 'fixtures/module-shadowing';
    return testOutput(sliceDir, [`${sliceDir}/*.ice`]);
  });

  test('keywords shadowing', () => {
    const sliceDir = 'fixtures';
    return testOutput(sliceDir, [`${sliceDir}/Keywords.ice`]);
  });

  test('types override', () => {
    const sliceDir = 'fixtures';
    return testOutput(sliceDir, [`${sliceDir}/override.ice`]);
  });

  test('Object fields must have Ice.Value type', () => {
    const sliceDir = 'fixtures';
    return testOutput(sliceDir, [`${sliceDir}/Value.ice`]);
  });

  test('generics', () => {
    const sliceDir = 'fixtures';
    return testOutput(sliceDir, [`${sliceDir}/Generics.ice`]);
  });

  test('dictionaries', () => {
    const sliceDir = 'fixtures';
    return testOutput(sliceDir, [`${sliceDir}/Dictionaries.ice`]);
  });

  test('deprecate', () => {
    const sliceDir = 'fixtures';
    return testOutput(sliceDir, [`${sliceDir}/deprecate.ice`]);
  });
});
