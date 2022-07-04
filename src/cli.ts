#!/usr/bin/env node
import {Command, Option} from 'commander';
import {slice2ts} from './index';
const packageJson = require('../package.json');

const rootDirsDesc = `Root dirs.
Output files will have the same structure as source files relative to root dirs.
Ice includes are also resolved in these dirs.`;

function repeatable(value: string, values: string[]) {
  values.push(value);
  return values;
}

const program = new Command()
  .version(packageJson.version)
  .usage('[options] <file ...>')
  .option('--root-dir <dir>', rootDirsDesc, repeatable, [])
  .option(
    '-e, --exclude <file>',
    'File paths or globs to exclude.',
    repeatable,
    [],
  )
  .option('-o, --out-dir <dir>', 'Directory where to put generated files.')
  .option('--no-js', 'If true, only the typings are generated.')
  .addOption(new Option('--js-modules <type>', 'Set the type of generated js modules.').choices(['cjs', 'esm']).default('cjs'))
  .option(
    '--ice-imports',
    'If true, Ice modules are imported from particular files instead of "ice".',
  )
  .option(
    '-i, --ignore <type>',
    "Don't generate typings for these types.",
    repeatable,
    [],
  )
  .option(
    '--index',
    'If true, generates index file for each top-level slice module.',
  )
  .option(
    '--no-nullable-values',
    "If true, don't generate `| null` for fields and parameters whose type " +
      'is Value',
  )
  .parse(process.argv);

const options = program.opts();

slice2ts({
  files: program.args,
  exclude: options.exclude,
  rootDirs: options.rootDir,
  outDir: options.outDir,
  noJs: !options.js,
  jsModules: options.jsModules,
  ignore: options.ignore,
  index: options.index,
  iceImports: options.iceImports,
  noNullableValues: !options.nullableValues,
}).catch(error => {
  console.log(error);
  process.exit(1);
});
