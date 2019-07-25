#pragma once

#include <A.ice>

module B {
  module A {
    class SomeClass {};

    class Child extends A::SomeClass {};
    class AbsoluteChild extends ::A::SomeClass {};

    class RootChild extends A::RootClass {};
  };
};
