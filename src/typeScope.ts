import {
  ModuleDeclaration,
  ClassDeclaration,
  InterfaceDeclaration,
  ExceptionDeclaration,
  StructDeclaration,
  EnumDeclaration,
  SequenceDeclaration,
  DictionaryDeclaration,
  ConstDeclaration,
} from 'slice2json';
import {LoadedSlices} from './load';

export type TypeDeclaration =
  | ClassDeclaration
  | InterfaceDeclaration
  | ExceptionDeclaration
  | StructDeclaration
  | EnumDeclaration
  | SequenceDeclaration
  | DictionaryDeclaration
  | ConstDeclaration;

export interface ScopeMember<T extends TypeDeclaration> {
  scope: TypeScope;
  declaration: T;
}

export interface TypeScope {
  /**
   * Fully-qualified module name.
   */
  module: string;
  children: {[name: string]: TypeScope | TypeDeclaration};
}

export function createTypeScope(slices: LoadedSlices): TypeScope {
  const children: {[name: string]: TypeScope | TypeDeclaration} = {};

  const scope = {module: '', children};

  for (const name of Object.keys(slices)) {
    for (const moduleDeclaration of slices[name].parsed.modules) {
      const {name} = moduleDeclaration;

      if (children[name] == null) {
        children[name] = {
          module: name,
          children: Object.create(children),
        };
      }

      populateModuleScope(children[name] as TypeScope, moduleDeclaration);
    }
  }

  return scope;
}

function populateModuleScope(
  scope: TypeScope,
  declaration: ModuleDeclaration,
) {
  for (const child of declaration.content) {
    if (child.type === 'module') {
      if (scope.children[child.name] == null) {
        scope.children[child.name] = {
          module: `${scope.module}::${child.name}`,
          children: Object.create(scope.children),
        };
      }
      populateModuleScope(scope.children[child.name] as TypeScope, child);
    } else if (
      child.type !== 'classForward' &&
      child.type !== 'interfaceForward'
    ) {
      scope.children[child.name] = child;
    }
  }

  return scope;
}

export function getTypeByName<T extends TypeDeclaration>(
  scope: TypeScope,
  typeName: string,
): ScopeMember<T> {
  const parts = typeName.split('::');
  const path = parts.slice(0, parts.length - 1);
  const name = parts[parts.length - 1];

  const typeScope = path.reduce(
    (currentScope, name) => currentScope.children[name] as TypeScope,
    scope,
  );

  if (typeScope == null) {
    throw new Error(`Module not found: ${path.join('::')}`);
  }

  const declaration = typeScope.children[name] as T;

  if (declaration == null) {
    throw new Error(`Type not found: ${typeName}`);
  }

  return {declaration, scope: typeScope};
}

export function getChildScope(scope: TypeScope, module: string): TypeScope {
  const childScope = scope.children[module] as TypeScope;

  if (childScope == null) {
    throw new Error(`Child module not found: ${module}`);
  }

  return childScope;
}
