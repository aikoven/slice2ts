#pragma once

module Overrides {
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
};