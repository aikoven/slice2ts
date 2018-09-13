#pragma once

module Generics {
  ["ts:generic:T extends Ice.Value"]
  sequence<["ts:type:T"] Object> GenericSeq;

  ["ts:generic:T extends Ice.Value"]
  dictionary<string, ["ts:type:T"] Object> GenericDict;

  struct Key {
    string key;
  };

  ["ts:generic:T extends Ice.Value"]
  dictionary<Key, ["ts:type:T"] Object> GenericComplexDict;

  ["ts:generic:T extends Ice.Value"]
  class GenericClass {
    ["ts:type:T"]
    Object field;
    ["ts:type:GenericSeq<T>"]
    GenericSeq seq;
    ["ts:type:GenericDict<T>"]
    GenericDict dict;
    ["ts:type:GenericComplexDict<T>"]
    GenericComplexDict complexDict;
  };

  ["ts:generic:T extends Ice.Value"]
  interface GenericInterface {
    ["ts:type:GenericClass<T>"] GenericClass operation(
      ["ts:type:GenericClass<T>"] GenericClass arg
    );
  };
};
