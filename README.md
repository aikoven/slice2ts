# slice2ts [![npm version][npm-image]][npm-url] [![Build Status][travis-image]][travis-url]

Compiles Slice files to TypeScript.

## Installation

    $ npm install -D slice2ts

## Usage

    Usage: slice2ts [options] <file ...>

    Options:

      -V, --version         output the version number
      --root-dir <dir>      Root dirs.
                            Output files will have the same structure as source files relative to root dirs.
                            Ice includes are also resolved in these dirs.
      -e, --exclude <file>  File paths or globs to exclude.
      -o, --out-dir <dir>   Directory where to put generated files.
      --no-js               If true, only the typings are generated.
      --ice-imports         If true, Ice modules are imported from particular files instead of "ice".
      -i, --ignore <type>   Don't generate typings for these types.
      --index               If true, generates index file for each top-level slice module.
      -h, --help            output usage information

## API

```ts
import {slice2ts} from 'slice2ts';

slice2ts(options)  // Promise<void>;
```

Options interface:

```ts
{
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
  /**
   * If true, generates index file for each top-level slice module.
   */
  index?: boolean;
}
```

[npm-image]: https://badge.fury.io/js/slice2ts.svg
[npm-url]: https://badge.fury.io/js/slice2ts
[travis-image]: https://travis-ci.org/aikoven/slice2ts.svg?branch=master
[travis-url]: https://travis-ci.org/aikoven/slice2ts
