#pragma once

#include <A.ice>

module B {
  module A {
    class Child extends A::SomeClass {};
  };
};
