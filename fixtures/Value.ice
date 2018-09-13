#pragma once

module Test {
  class TestClass {
    Object objectField;

    /**
     * Can't support Value fields yet
     * See https://github.com/zeroc-ice/ice/pull/203
     **/
    // Value valueField;
  };

  interface TestInterface {
    void method(Value valueArg, Object objectArg);
  };
};
