import * as slice2json from 'slice2json';
import * as path from 'path';
import * as prettier from 'prettier';
import assertNever from 'assert-never';

import {generateImports} from './generateImports';
import {LoadedSlices} from './load';
import {NamespaceFilePaths} from './namespaceFilePaths';
import {
  TypeScope,
  ScopeMember,
  getTypeByName,
  getChildScope,
} from './typeScope';
import {render} from './render';

export function generateTypings(
  scope: TypeScope,
  sliceName: string,
  slices: LoadedSlices,
  namespaceFilePaths: NamespaceFilePaths,
  ignore: string[],
  iceImports: boolean,
): string {
  const imports = generateImports(sliceName, slices, iceImports);

  const topLevelModules = slices[sliceName].parsed.modules.map(module =>
    generateTopLevelModule(
      scope,
      sliceName,
      module,
      namespaceFilePaths,
      new Set(ignore),
    ),
  );

  const contents = render`
    ${imports}

    ${topLevelModules}
  `;

  return prettier.format(contents, {
    parser: 'typescript',
  });
}

function generateTopLevelModule(
  scope: TypeScope,
  sliceName: string,
  declaration: slice2json.ModuleDeclaration,
  namespaceFilePaths: NamespaceFilePaths,
  ignore: Set<string>,
): string {
  const namespaceFilePath = namespaceFilePaths[declaration.name];
  let namespaceRelativePath = path.relative(
    path.dirname(sliceName),
    path.join(
      path.dirname(namespaceFilePath),
      path.basename(namespaceFilePath, '.d.ts'),
    ),
  );
  if (!namespaceRelativePath.startsWith('.')) {
    namespaceRelativePath = `./${namespaceRelativePath}`;
  }

  return render`
    declare module "${namespaceRelativePath}" {
      ${generateModule(scope, declaration, ignore)}
    }
    export { ${declaration.name} } from "${namespaceRelativePath}";
  `;
}

function generateDocComment(what: {doc?: string}): string {
  if (what.doc === undefined) {
    return '';
  }
  const prefixed = what.doc
    .split('\n')
    .map(line => ` * ${line}`)
    .join('\n');
  return `/**\n${prefixed}\n */`;
}

function generateModule(
  scope: TypeScope,
  declaration: slice2json.ModuleDeclaration,
  ignore: Set<string>,
): string {
  const childScope = getChildScope(scope, declaration.name);

  return render`
    ${generateDocComment(declaration)}
    namespace ${declaration.name} {
      ${declaration.content.map(child =>
        generateModuleChild(childScope, child, ignore),
      )}
    }
  `;
}

function generateModuleChild(
  scope: TypeScope,
  child: slice2json.ModuleChild,
  ignore: Set<string>,
): string | null {
  if (ignore.has(`${scope.module}::${child.name}`)) {
    return '';
  }

  switch (child.type) {
    case 'module':
      return generateModule(scope, child, ignore);
    case 'class':
      return generateClass(scope, child);
    case 'classForward':
      return null;
    case 'interface':
      return generateInterface(scope, child);
    case 'interfaceForward':
      return null;
    case 'exception':
      return generateException(scope, child);
    case 'struct':
      return generateStruct(scope, child);
    case 'enum':
      return generateEnum(scope, child);
    case 'sequence':
      return generateSequence(scope, child);
    case 'dictionary':
      return generateDictionary(scope, child);
    case 'const':
      return generateConstant(scope, child);
    default:
      return assertNever(child);
  }
}

/**
 * @param external if true, the data type is resolved to fully-qualified
 */
function generateComplexType(
  scope: TypeScope,
  dataType: string,
  external: boolean = false,
): string {
  const match = dataType.match(complexTypeRegexp)!;

  let typeName = match[1];
  const isProxy = match[2] != null;

  let tsType;

  if (typeName === 'Object') {
    tsType = 'Ice.Object';
  } else {
    if (external) {
      const member = getTypeByName(scope, typeName);

      typeName = `${member.scope.module}::${member.declaration.name}`;
    }

    tsType = typeName.replace(/::/g, '.');
  }

  return isProxy ? tsType + 'Prx' : tsType;
}

const complexTypeRegexp = /^(.*?)(\s*\*)?$/;

/**
 * @param external if true, the data type is resolved to fully-qualified
 */
function generateDataType(
  scope: TypeScope,
  dataType: string,
  external: boolean = false,
): string {
  switch (dataType) {
    case 'bool':
      return 'boolean';
    case 'string':
      return 'string';
    case 'void':
      return 'void';
    case 'byte':
    case 'int':
    case 'float':
    case 'double':
    case 'short':
      return 'number';
    case 'long':
      return 'Ice.Long';
    default:
      return generateComplexType(scope, dataType, external);
  }
}

function generateClass(
  scope: TypeScope,
  declaration: slice2json.ClassDeclaration,
): string {
  const base = declaration.extends
    ? generateComplexType(scope, declaration.extends)
    : declaration.local ? null : 'Ice.Value';

  const fields = declaration.content.filter(
    child => child.type === 'field',
  ) as slice2json.ClassFieldDeclaration[];

  const operations = declaration.content.filter(
    child => child.type === 'operation',
  ) as slice2json.OperationDeclaration[];

  if (operations.length > 0 && !declaration.local) {
    const fqName = `${scope.module}::${declaration.name}`;
    throw new Error(`Class operations not supported: ${fqName}`);
  }

  return render`
    ${generateDocComment(declaration)}
    class ${declaration.name}${base && ` extends ${base}`} {
      ${generateClassConstructor(scope, declaration)}

      ${fields.map(field => generateClassField(scope, field))}

      ${operations.map(operation =>
        generateLocalOperation(scope, operation, false),
      )}
    }
  `;
}

function generateClassConstructor(
  scope: TypeScope,
  declaration: slice2json.ClassDeclaration | slice2json.ExceptionDeclaration,
): string {
  if (declaration.content.length === 0) {
    // no own fields - inherit parent constructor
    return '';
  }

  const chain = [{declaration, scope}];

  while (true) {
    const parent = chain[0].declaration.extends;

    if (parent == null) {
      break;
    }

    chain.unshift(getTypeByName<slice2json.ClassDeclaration>(scope, parent));
  }

  const parameters: string[] = [];

  for (const member of chain) {
    const external = member.scope.module !== scope.module;

    for (const child of member.declaration.content) {
      if (child.type === 'field') {
        const dataType = generateDataType(
          member.scope,
          child.dataType,
          external,
        );
        parameters.push(render`
          ${child.name}?: ${dataType}${child.optional != null && ' | undefined'}
        `);
      }
    }
  }

  return `constructor(${parameters.join(', ')})`;
}

function generateClassField(
  scope: TypeScope,
  child: slice2json.ClassFieldDeclaration,
): string {
  const dataType = generateDataType(scope, child.dataType);
  return render`
    ${generateDocComment(child)}
    ${child.name}${child.optional != null && '?'}: ${dataType};
  `;
}

function generateInterface(
  scope: TypeScope,
  declaration: slice2json.InterfaceDeclaration,
): string {
  // collect all operations including inherited
  const allInterfaces = [{declaration, scope}];
  const visited = new Set<ScopeMember<slice2json.InterfaceDeclaration>>(
    allInterfaces,
  );

  for (const member of allInterfaces) {
    if (member.declaration.extends == null) {
      continue;
    }

    for (const parentName of member.declaration.extends) {
      const parent = getTypeByName<slice2json.InterfaceDeclaration>(
        scope,
        parentName,
      );

      if (!visited.has(parent)) {
        visited.add(parent);
        allInterfaces.push(parent);
      }
    }
  }

  allInterfaces.reverse();

  const allOperations: Array<{
    // scope of the interface where operation is defined
    scope: TypeScope;
    operation: slice2json.OperationDeclaration;
    // true if operation is defined in an ancestor from another scope
    external: boolean;
  }> = [];

  for (const member of allInterfaces) {
    const external = member.scope.module !== scope.module;
    allOperations.push(
      ...member.declaration.content.map(operation => ({
        scope: member.scope,
        operation,
        external,
      })),
    );
  }

  const {extends: parentNames} = declaration;

  if (declaration.local) {
    const extendsString =
      parentNames &&
      ` extends ${parentNames.map(t => generateComplexType(scope, t))}`;

    return render`
      ${generateDocComment(declaration)}
      interface ${declaration.name}${extendsString} {
        ${allOperations.map(({scope, operation, external}) =>
          generateLocalOperation(scope, operation, external),
        )}
      }
    `;
  } else {
    const implementsString =
      parentNames &&
      `implements ${parentNames.map(t => generateComplexType(scope, t))}`;

    const proxyImplementsString =
      parentNames &&
      `implements ${parentNames.map(
        t => `${generateComplexType(scope, t)}Prx`,
      )}`;

    return render`
      ${generateDocComment(declaration)}
      abstract class ${declaration.name}
      extends Ice.Object
      ${implementsString} {
        ${allOperations.map(({scope, operation, external}) =>
          generateOperation(scope, operation, external),
        )}
      }

      ${generateDocComment(declaration)}
      class ${declaration.name}Prx
      extends Ice.ObjectPrx
      ${proxyImplementsString} {
        ${allOperations.map(({scope, operation, external}) =>
          generateProxyOperation(scope, operation, external),
        )}
      }
    `;
  }
}

/**
 * @param external if true, all types are resolved to fully-qualified
 */
function generateLocalOperation(
  scope: TypeScope,
  operation: slice2json.OperationDeclaration,
  external: boolean,
): string {
  const parameters = generateLocalParameters(scope, operation, external);
  const returnType = generateReturnType(scope, operation, external);

  return render`
    ${generateDocComment(operation)}
    ${operation.name}(${parameters}): ${returnType};
  `;
}

/**
 * @param external if true, parameter types are resolved to fully-qualified
 */
function generateLocalParameters(
  scope: TypeScope,
  operation: slice2json.OperationDeclaration,
  external: boolean,
): string {
  const reversedParameters = operation.parameters
    .filter(parameter => !parameter.out)
    .reverse();

  const reversedParamStrings = [];
  let seenRequired = false;

  for (const parameter of reversedParameters) {
    const dataType = generateDataType(scope, parameter.dataType, external);

    if (parameter.optional != null) {
      if (seenRequired) {
        reversedParamStrings.push(`${parameter.name}: ${dataType} | undefined`);
      } else {
        reversedParamStrings.push(`${parameter.name}?: ${dataType}`);
      }
    } else {
      reversedParamStrings.push(`${parameter.name}: ${dataType}`);
      seenRequired = true;
    }
  }

  return reversedParamStrings.reverse().join(', ');
}

/**
 * @param external if true, all types are resolved to fully-qualified
 */
function generateOperation(
  scope: TypeScope,
  operation: slice2json.OperationDeclaration,
  external: boolean,
): string {
  const parameters = generateParameters(scope, operation, external);
  const returnType = generateReturnType(scope, operation, external);

  return render`
    ${generateDocComment(operation)}
    abstract ${operation.name}(${parameters}): Ice.NativePromise<${returnType}>;
  `;
}

/**
 * @param external if true, parameter types are resolved to fully-qualified
 */
function generateParameters(
  scope: TypeScope,
  operation: slice2json.OperationDeclaration,
  external: boolean,
): string {
  const parameterStrings: string[] = [];

  for (const parameter of operation.parameters) {
    if (parameter.out) {
      continue;
    }

    const dataType = generateDataType(scope, parameter.dataType, external);

    let paramString = `${parameter.name}: ${dataType}`;

    if (parameter.optional != null) {
      paramString += ' | undefined';
    }

    parameterStrings.push(paramString);
  }

  parameterStrings.push('current: Ice.Current');

  return parameterStrings.join(', ');
}

/**
 * @param external if true, all types are resolved to fully-qualified
 */
function generateProxyOperation(
  scope: TypeScope,
  operation: slice2json.OperationDeclaration,
  external: boolean,
): string {
  return render`
    ${generateDocComment(operation)}
    ${operation.name}(${generateProxyParameters(scope, operation, external)}):
      Ice.OperationResult<${generateReturnType(scope, operation, external)}>;
  `;
}

/**
 * @param external if true, parameter types are resolved to fully-qualified
 */
function generateProxyParameters(
  scope: TypeScope,
  operation: slice2json.OperationDeclaration,
  external: boolean,
): string {
  const reversedParameters = operation.parameters
    .filter(parameter => !parameter.out)
    .reverse();

  const reversedParamStrings = ['ctx?: Ice.Context'];
  let seenRequired = false;

  for (const parameter of reversedParameters) {
    const dataType = generateDataType(scope, parameter.dataType, external);

    if (parameter.optional != null) {
      if (seenRequired) {
        reversedParamStrings.push(`${parameter.name}: ${dataType} | undefined`);
      } else {
        reversedParamStrings.push(`${parameter.name}?: ${dataType}`);
      }
    } else {
      reversedParamStrings.push(`${parameter.name}: ${dataType}`);
      seenRequired = true;
    }
  }

  return reversedParamStrings.reverse().join(', ');
}

/**
 * @param external if true, return type is resolved to fully-qualified
 */
function generateReturnType(
  scope: TypeScope,
  operation: slice2json.OperationDeclaration,
  external: boolean,
) {
  const outParameters = operation.parameters.filter(parameter => parameter.out);

  if (outParameters.length === 0) {
    const returnType = generateDataType(scope, operation.returnType, external);
    return operation.returnOptional ? `${returnType} | void` : returnType;
  } else {
    const returnType = generateDataType(scope, operation.returnType, external);

    const returnTypes: string[] = [
      operation.returnOptional ? `${returnType} | undefined` : returnType,
    ];

    for (const outParameter of outParameters) {
      const parameterType = generateDataType(
        scope,
        outParameter.dataType,
        external,
      );

      returnTypes.push(
        outParameter.optional != null
          ? `${parameterType} | undefined`
          : parameterType,
      );
    }

    return `[${returnTypes.join(', ')}]`;
  }
}

function generateException(
  scope: TypeScope,
  declaration: slice2json.ExceptionDeclaration,
): string {
  const base = declaration.extends
    ? generateComplexType(scope, declaration.extends)
    : declaration.local ? 'Ice.LocalException' : 'Ice.UserException';

  return render`
    ${generateDocComment(declaration)}
    class ${declaration.name} extends ${base} {
      ${generateClassConstructor(scope, declaration)}

      ${declaration.content.map(field => generateClassField(scope, field))}
    }
  `;
}

function generateStruct(
  scope: TypeScope,
  declaration: slice2json.StructDeclaration,
): string {
  const parameters: string[] = [];
  const fields: string[] = [];

  for (const field of declaration.fields) {
    const dataType = generateDataType(scope, field.dataType);

    parameters.push(`${field.name}?: ${dataType}`);
    fields.push(render`
      ${generateDocComment(field)}
      ${field.name}: ${dataType};
    `);
  }

  return render`
    ${generateDocComment(declaration)}
    class ${declaration.name} implements Ice.Struct {
      constructor(${parameters.join(', ')});

      ${fields}

      clone(): this;
      equals(other: this): boolean;
      hashCode(): number;
    }
  `;
}

function generateEnum(
  scope: TypeScope,
  declaration: slice2json.EnumDeclaration,
): string {
  const names = declaration.enums.map(element => `'${element.name}'`);
  const namesType = `${declaration.name}Name`;

  return render`
    type ${namesType} = ${names.join(' | ')};

    ${generateDocComment(declaration)}
    class ${declaration.name}<Name extends ${namesType} = ${namesType}>
    extends Ice.EnumBase<Name> {
      ${declaration.enums.map(
        element => render`
          ${generateDocComment(element)}
          static ${element.name}: ${declaration.name}<'${element.name}'>;
        `,
      )}
    }
  `;
}

function generateSequence(
  scope: TypeScope,
  declaration: slice2json.SequenceDeclaration,
): string {
  const dataType = generateDataType(scope, declaration.dataType);

  return render`
    ${generateDocComment(declaration)}
    type ${declaration.name} = Array<${dataType}>;
  `;
}

function generateDictionary(
  scope: TypeScope,
  declaration: slice2json.DictionaryDeclaration,
): string {
  const keyType = generateDataType(scope, declaration.keyType);
  const valueType = generateDataType(scope, declaration.valueType);

  const isBuiltIn =
    keyType === 'boolean' || keyType === 'string' || keyType === 'number';

  const container = isBuiltIn ? 'Map' : 'Ice.HashMap';

  return render`
    ${generateDocComment(declaration)}
    type ${declaration.name} = ${container}<${keyType}, ${valueType}>;
  `;
}

function generateConstant(
  scope: TypeScope,
  declaration: slice2json.ConstDeclaration,
): string {
  const dataType = generateDataType(scope, declaration.dataType);

  return render`
    ${generateDocComment(declaration)}
    const ${declaration.name}: ${dataType};
  `;
}
