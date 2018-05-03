#pragma once

module Default {
  struct S {
    int import;
  };

  class C {
    int import;
  };

  interface I {
    void import();
  };

  enum E {
    TRY
  };

  dictionary<S, int> Catch;
};