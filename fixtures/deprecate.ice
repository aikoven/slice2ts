#pragma once

module Test {
  ["deprecate"]
  interface A {};

  ["deprecate:a message"]
  interface B {};

  /**
   * docstring
   **/
  ["deprecate"]
  interface C {};
};
