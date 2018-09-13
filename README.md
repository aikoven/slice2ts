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
      --no-nullable-values  If true, don't generate `| null` for fields and parameters whose type is Value.
      -h, --help            output usage information

## API

```ts
import {slice2ts} from 'slice2ts';

slice2ts(options); // Promise<void>;
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
  /**
   * If true, don't generate `| null` for fields and parameters whose type is
   * Value.
   */
  noNullableValues?: boolean;
}
```

## Metadata Directives

* `ts:type:<type>`

  Overrides generated type for fields, operation parameters or operation return
  values:

  ```slice
  class AbstractBase {};
  class A extends AbstractBase {};
  class B extends AbstractBase {};

  struct S {
    ["ts:type:A|B"]
    AbstractBase field;
  };

  class C {
    ["ts:type:A|B"]
    AbstractBase field1;

    ["ts:type:A|B"]
    optional(1) AbstractBase field2;
  };

  interface I {
    ["ts:type:A|B"] AbstractBase operation(
      ["ts:type:A|B"] AbstractBase arg1,
      ["ts:type:A|B"] optional(1) AbstractBase arg2
    );
  };
  ```

  Outputs:

  ```ts
  class AbstractBase extends Ice.Value {}
  class A extends AbstractBase {}
  class B extends AbstractBase {}

  class S implements Ice.Struct {
    constructor(field?: A | B);

    field: A | B;

    clone(): this;
    equals(other: this): boolean;
    hashCode(): number;
  }

  class C extends Ice.Value {
    constructor(field1?: A | B, field2?: A | B | undefined);

    field1: A | B;
    field2?: A | B;
  }

  abstract class I extends Ice.Object {
    abstract operation(
      arg1: A | B,
      arg2: A | B | undefined,
      current: Ice.Current,
    ): Ice.OperationResult<A | B>;
  }

  class IPrx extends Ice.ObjectPrx {
    operation(
      arg1: A | B,
      arg2?: A | B,
      ctx?: Ice.Context,
    ): Ice.AsyncResult<A | B>;
  }
  ```

* `ts:generic:<type parameters>`

  Adds generic parameters for types generated from sequences, dictionaries,
  classes and interfaces:

  ```slice
  ["ts:generic:T extends Ice.Value"]
  sequence<["ts:type:T"] Object> GenericSeq;

  ["ts:generic:T extends Ice.Value"]
  dictionary<string, ["ts:type:T"] Object> GenericDict;

  ["ts:generic:T extends Ice.Value"]
  class GenericClass {
    ["ts:type:T"]
    Object field;
  };

  ["ts:generic:T extends Ice.Value"]
  interface GenericInterface {
    ["ts:type:GenericClass<T>"] GenericClass operation(
      ["ts:type:GenericSeq<T>"] GenericSeq arg
    );
  };
  ```

  Outputs:

  ```ts
  type GenericSeq<T extends Ice.Value> = Array<T>;

  type GenericDict<T extends Ice.Value> = Map<string, T>;
  const GenericDict: {
    new <T extends Ice.Value>(entries?: ReadonlyArray<[string, T]>): Map<
      string,
      T
    >;
  };

  class GenericClass<T extends Ice.Value> extends Ice.Value {
    constructor(field?: T);

    field: T;
  }

  abstract class GenericInterface<T extends Ice.Value> extends Ice.Object {
    abstract operation(
      arg: GenericSeq<T>,
      current: Ice.Current,
    ): Ice.OperationResult<GenericClass<T>>;
  }

  class GenericInterfacePrx<T extends Ice.Value> extends Ice.ObjectPrx {
    operation(
      arg: GenericSeq<T>,
      ctx?: Ice.Context,
    ): Ice.AsyncResult<GenericClass<T>>;
  }
  ```

[npm-image]: https://badge.fury.io/js/slice2ts.svg
[npm-url]: https://badge.fury.io/js/slice2ts
[travis-image]: https://travis-ci.org/aikoven/slice2ts.svg?branch=master
[travis-url]: https://travis-ci.org/aikoven/slice2ts
