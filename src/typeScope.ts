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

/** @internal */
export type TypeDeclaration =
  | ClassDeclaration
  | InterfaceDeclaration
  | ExceptionDeclaration
  | StructDeclaration
  | EnumDeclaration
  | SequenceDeclaration
  | DictionaryDeclaration
  | ConstDeclaration;

/** @internal */
export interface ScopeMember<T extends TypeDeclaration> {
  scope: TypeScope;
  declaration: T;
}

export interface QualifiedDeclaration<T extends TypeDeclaration> {
  type: 'declaration';
  parentScope: TypeScope;
  declaration: T;
}

/** @internal */
export interface TypeScope {
  type: 'scope';
  rootScope?: TypeScope;
  parentScope?: TypeScope;
  /**
   * Fully-qualified module id starting with `::`
   */
  module: string;
  names: {
    [name: string]:
      | TypeScope
      | QualifiedDeclaration<TypeDeclaration>
      | undefined;
  };
}

/** @internal */
export function createTypeScope(slices: LoadedSlices): TypeScope {
  const rootScope: TypeScope = {
    type: 'scope',
    module: '',
    names: {},
  };

  const moduleScopes: Array<{
    moduleDeclaration: ModuleDeclaration;
    parentScope: TypeScope;
  }> = [];

  for (const name of Object.keys(slices)) {
    for (const moduleDeclaration of slices[name].parsed.modules) {
      moduleScopes.push({moduleDeclaration, parentScope: rootScope});
    }
  }

  for (const {moduleDeclaration, parentScope} of moduleScopes) {
    const {name} = moduleDeclaration;
    const module = `${parentScope.module}::${name}`;

    let scope: TypeScope;

    const existingModuleScope = parentScope.names[name] as
      | TypeScope
      | undefined;

    if (existingModuleScope == null || existingModuleScope.module !== module) {
      scope = parentScope.names[name] = {
        type: 'scope',
        rootScope,
        parentScope,
        module,
        names: {},
      };
    } else {
      scope = existingModuleScope;
    }

    for (const child of moduleDeclaration.content) {
      if (child.type === 'module') {
        moduleScopes.push({
          moduleDeclaration: child,
          parentScope: scope,
        });
      } else if (
        child.type !== 'classForward' &&
        child.type !== 'interfaceForward'
      ) {
        scope.names[child.name] = {
          type: 'declaration',
          parentScope: scope,
          declaration: child,
        };
      }
    }
  }

  return rootScope;
}

/** @internal */
export function getTypeByName<T extends TypeDeclaration>(
  scope: TypeScope,
  typeName: string,
): ScopeMember<T> {
  if (typeName.startsWith('::') && scope.rootScope != null) {
    return getTypeByName<T>(scope.rootScope, typeName.slice(2));
  }

  const path = typeName.split('::');

  let qualDeclaration: QualifiedDeclaration<any> | undefined;

  while (true) {
    const child = getChildByPath(scope, path);

    if (child != null && child.type === 'declaration') {
      qualDeclaration = child;
      break;
    }

    if (scope.parentScope == null) {
      break;
    }

    scope = scope.parentScope;
  }

  if (qualDeclaration == null) {
    throw new Error(
      `Type ${typeName} not found relative to module ${scope.module}`,
    );
  }

  return {
    scope: qualDeclaration.parentScope,
    declaration: qualDeclaration.declaration,
  };
}

function getChildByPath(
  scope: TypeScope,
  path: string[],
): TypeScope | QualifiedDeclaration<TypeDeclaration> | undefined {
  let current:
    | TypeScope
    | QualifiedDeclaration<TypeDeclaration>
    | undefined = scope;

  for (const name of path) {
    if (current == null || current.type !== 'scope') {
      return undefined;
    }
    current = current.names[name];
  }

  return current;
}

/** @internal */
export function getChildScope(scope: TypeScope, module: string): TypeScope {
  const childScope = scope.names[module] as TypeScope;

  if (childScope == null) {
    throw new Error(`Child module not found: ${module}`);
  }

  return childScope;
}
