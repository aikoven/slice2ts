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
  module: string;
  declaration: T;
}

export interface QualifiedDeclaration<T extends TypeDeclaration> {
  /**
   * Fully-qualified ::-separated module name.
   */
  module: string;
  declaration: T;
}

/** @internal */
export interface TypeScope {
  module: string;
  names: {
    [name: string]: TypeScope | QualifiedDeclaration<TypeDeclaration>;
  };
}

/** @internal */
export function createTypeScope(slices: LoadedSlices): TypeScope {
  const rootScope: TypeScope = {
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
    const module = parentScope.module ? `${parentScope.module}::${name}` : name;

    let scope: TypeScope;

    const existingModuleScope = parentScope.names[name] as
      | TypeScope
      | undefined;

    if (existingModuleScope == null) {
      scope = parentScope.names[name] = {
        module,
        names: Object.create(parentScope.names),
      };
    } else if (existingModuleScope.module === module) {
      scope = existingModuleScope;
    } else {
      scope = parentScope.names[name] = {
        module,
        names: Object.create(existingModuleScope.names),
      };
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
          module,
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
  const parts = typeName.split('::');
  const path = parts.slice(0, parts.length - 1);
  const name = parts[parts.length - 1];

  const typeScope = path.reduce(
    (currentScope, name) => currentScope.names[name] as TypeScope,
    scope,
  );

  if (typeScope == null) {
    throw new Error(`Module not found: ${path.join('::')}`);
  }

  const qualDeclaration = typeScope.names[name] as QualifiedDeclaration<T>;

  if (qualDeclaration == null) {
    // console.log(flatten(scope));
    // console.log(flatten(typeScope));
    throw new Error(`Type not found: ${typeName}`);
  }

  return {scope: typeScope, ...qualDeclaration};
}

/** @internal */
export function getChildScope(scope: TypeScope, module: string): TypeScope {
  const childScope = scope.names[module] as TypeScope;

  if (childScope == null) {
    throw new Error(`Child module not found: ${module}`);
  }

  return childScope;
}
