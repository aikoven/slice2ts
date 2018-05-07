#pragma once

module Overrides {
  class Base {};
  class A extends Base {};
  class B extends Base {};

  interface I {
    ["ts:type:A|B"]
    Base operation(["ts:type:A|B"] Base arg, ["ts:type:A|B"] optional(1) Base arg);
  };
};