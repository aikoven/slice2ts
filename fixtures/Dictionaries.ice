#pragma once

module Test {
  dictionary<string, string> StringDict;

  struct Struct {};

  dictionary<Struct, string> StructDict;

  enum Enum {
    A
  };

  dictionary<Enum, string> EnumDict;
};
