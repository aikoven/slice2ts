#!/usr/bin/env node
import * as commander from 'commander';
import {slice2ts} from './index';
const packageJson = require('../package.json');

const rootDirsDesc = `Root dirs.
Output files will have the same structure as source files relative to root dirs.
Ice includes are also resolved in these dirs.`;

function repeatable(value: string, values: string[]) {
  values.push(value);
  return values;
}

const program = commander
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
  .parse(process.argv);

slice2ts({
  files: program.args,
  exclude: program.exclude,
  rootDirs: program.rootDir,
  outDir: program.outDir,
  noJs: !program.js,
  ignore: program.ignore,
  index: program.index,
  iceImports: program.iceImports,
}).catch(error => {
  console.log(error);
  process.exit(1);
});
