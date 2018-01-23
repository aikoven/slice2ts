import * as path from 'path';
import {resolveGlobs} from './utils/resolveGlobs';
import {loadSlices} from './load';
import {getNamespaceFilePaths, getTopLevelModules} from './topLevelModules';
import {createTypeScope} from './typeScope';
import {generateTypings} from './generateTypings';

jest.setTimeout(30000);

describe('generate typings', () => {
  test('built-in slices', async () => {
    const sliceDir = 'node_modules/slice2js/ice/slice';

    const paths = await resolveGlobs([`${sliceDir}/**/*.ice`]);

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
      );
      expect(typings).toMatchSnapshot();
    }
  });

  test('module shadowing', async () => {
    const sliceDir = 'fixtures/module-shadowing';

    const paths = await resolveGlobs([`${sliceDir}/*.ice`]);

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
        false,
      );
      expect(typings).toMatchSnapshot();
    }
  });
});
