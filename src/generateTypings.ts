import * as slice2json from 'slice2json';
import * as path from 'path';
import * as prettier from 'prettier';
import assertNever from 'assert-never';

import {generateImports} from './generateImports';
import {LoadedSlices} from './load';
import {NamespaceFilePaths} from './topLevelModules';
import {
  TypeScope,
  ScopeMember,
  getTypeByName,
  getChildScope,
} from './typeScope';
import {render} from './render';

/** @internal */
export async function generateTypings(
  scope: TypeScope,
  sliceName: string,
  slices: LoadedSlices,
  namespaceFilePaths: NamespaceFilePaths,
  ignore: string[],
  iceImports: boolean,
): Promise<string> {
  return new Generator(
    scope,
    sliceName,
    slices,
    namespaceFilePaths,
    ignore,
    iceImports,
  ).generate();
}

class Generator {
  constructor(
    private scope: TypeScope,
    private sliceName: string,
    private slices: LoadedSlices,
    private namespaceFilePaths: NamespaceFilePaths,
    ignore: string[],
    private iceImports: boolean,
  ) {
    this.ignore = new Set(ignore);
  }

  private ignore: Set<string>;
  private namespacesToAlias = new Set<string>();

  async generate() {
    const {scope, sliceName, slices, namespaceFilePaths, iceImports} = this;
    const imports = generateImports(sliceName, slices, iceImports);

    const topLevelModules = slices[sliceName].parsed.modules.map(module =>
      this.generateTopLevelModule(scope, sliceName, module, namespaceFilePaths),
    );

    // aliases are populated during contents generation
    const aliases = [...this.namespacesToAlias].map(
      namespace => `import _${namespace} = ${namespace};`,
    );

    const contents = render`
      ${imports}

      ${aliases}

      ${topLevelModules}
    `;

    const config = await prettier.resolveConfig(process.cwd());

    return prettier.format(contents, {
      ...config,
      parser: 'typescript',
    });
  }

  private generateTopLevelModule(
    scope: TypeScope,
    sliceName: string,
    declaration: slice2json.ModuleDeclaration,
    namespaceFilePaths: NamespaceFilePaths,
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
        ${this.generateModule(scope, declaration)}
      }
      export { ${declaration.name} } from "${namespaceRelativePath}";
    `;
  }

  private generateDocComment(what: {doc?: string}): string {
    if (what.doc === undefined) {
      return '';
    }
    const prefixed = what.doc
      .split('\n')
      .map(line => ` * ${line}`)
      .join('\n');
    return `/**\n${prefixed}\n */`;
  }

  private generateModule(
    scope: TypeScope,
    declaration: slice2json.ModuleDeclaration,
  ): string {
    const childScope = getChildScope(scope, declaration.name);

    return render`
      ${this.generateDocComment(declaration)}
      namespace ${declaration.name} {
        ${declaration.content.map(child =>
          this.generateModuleChild(childScope, child),
        )}
      }
    `;
  }

  private generateModuleChild(
    scope: TypeScope,
    child: slice2json.ModuleChild,
  ): string | null {
    if (this.ignore.has(`${scope.module}::${child.name}`)) {
      return '';
    }

    switch (child.type) {
      case 'module':
        return this.generateModule(scope, child);
      case 'class':
        return this.generateClass(scope, child);
      case 'classForward':
        return null;
      case 'interface':
        return this.generateInterface(scope, child);
      case 'interfaceForward':
        return null;
      case 'exception':
        return this.generateException(scope, child);
      case 'struct':
        return this.generateStruct(scope, child);
      case 'enum':
        return this.generateEnum(scope, child);
      case 'sequence':
        return this.generateSequence(scope, child);
      case 'dictionary':
        return this.generateDictionary(scope, child);
      case 'const':
        return this.generateConstant(scope, child);
      default:
        return assertNever(child);
    }
  }

  /**
   * @param external if true, the data type is resolved to fully-qualified
   */
  private generateComplexType(
    scope: TypeScope,
    dataType: string,
    external: boolean = false,
    noNull: boolean = false,
  ): string {
    const match = dataType.match(this.complexTypeRegexp)!;

    let typeName = match[1];
    const isProxy = match[2] != null;

    let tsType;
    let isClass;

    if (typeName === 'Object') {
      tsType = 'Ice.Object';
      isClass = true;
    } else if (typeName === 'Value') {
      tsType = 'Ice.Value';
      isClass = true;
    } else {
      const member = getTypeByName(scope, typeName);

      isClass = member.declaration.type === 'class';

      if (external) {
        typeName = `${member.module}::${member.declaration.name}`;
      }

      tsType = typeName.replace(/::/g, '.');

      // we need to alias a root namespace where this type belongs
      // in case when generated definition is put to a different namespace with
      // the same name
      const typeTopLevelModule = member.module.split('::')[0];

      if (scope.module.includes(`::${typeTopLevelModule}`)) {
        this.namespacesToAlias.add(typeTopLevelModule);
        tsType = `_${tsType}`;
      }
    }

    if (isProxy) {
      tsType = `${tsType}Prx`;
    }

    if (!noNull && (isProxy || isClass)) {
      tsType = `${tsType} | null`;
    }

    return tsType;
  }

  private complexTypeRegexp = /^(.*?)(\s*\*)?$/;

  /**
   * @param external if true, the data type is resolved to fully-qualified
   */
  private generateDataType(
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
      case 'LocalObject':
        return 'object';
      default:
        return this.generateComplexType(scope, dataType, external);
    }
  }

  private generateClass(
    scope: TypeScope,
    declaration: slice2json.ClassDeclaration,
  ): string {
    const base = declaration.extends
      ? this.generateComplexType(scope, declaration.extends, false, true)
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
      ${this.generateDocComment(declaration)}
      class ${declaration.name}${base && ` extends ${base}`} {
        ${this.generateClassConstructor(scope, declaration)}

        ${fields.map(field => this.generateClassField(scope, field))}

        ${operations.map(operation =>
          this.generateLocalOperation(scope, operation, false),
        )}
      }
    `;
  }

  private generateClassConstructor(
    scope: TypeScope,
    declaration: slice2json.ClassDeclaration | slice2json.ExceptionDeclaration,
  ): string {
    if (declaration.content.length === 0) {
      // no own fields - inherit parent constructor
      return '';
    }

    const member = getTypeByName<
      slice2json.ClassDeclaration | slice2json.ExceptionDeclaration
    >(scope, declaration.name);

    const chain = [member];

    while (true) {
      const parent = chain[0].declaration.extends;

      if (parent == null) {
        break;
      }

      chain.unshift(getTypeByName<slice2json.ClassDeclaration>(scope, parent));
    }

    const parameters: string[] = [];

    for (const chainMember of chain) {
      const external = chainMember.module !== member.module;

      for (const child of chainMember.declaration.content) {
        if (child.type === 'field') {
          const dataType = this.generateDataType(
            chainMember.scope,
            child.dataType,
            external,
          );
          parameters.push(render`
            ${child.name}?: ${dataType}${child.optional != null &&
            ' | undefined'}
          `);
        }
      }
    }

    return `constructor(${parameters.join(', ')})`;
  }

  private generateClassField(
    scope: TypeScope,
    child: slice2json.ClassFieldDeclaration,
  ): string {
    const dataType = this.generateDataType(scope, child.dataType);
    return render`
      ${this.generateDocComment(child)}
      ${child.name}${child.optional != null && '?'}: ${dataType};
    `;
  }

  private generateInterface(
    scope: TypeScope,
    declaration: slice2json.InterfaceDeclaration,
  ): string {
    const member = getTypeByName<slice2json.InterfaceDeclaration>(
      scope,
      declaration.name,
    );
    // collect all operations including inherited
    const allInterfaces = [member];
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

    for (const allMember of allInterfaces) {
      const external = allMember.module !== member.module;
      allOperations.push(
        ...allMember.declaration.content.map(operation => ({
          scope: allMember.scope,
          operation,
          external,
        })),
      );
    }

    const {extends: parentNames} = declaration;

    if (declaration.local) {
      const extendsString =
        parentNames &&
        ` extends ${parentNames.map(t =>
          this.generateComplexType(scope, t, false, true),
        )}`;

      return render`
        ${this.generateDocComment(declaration)}
        interface ${declaration.name}${extendsString} {
          ${allOperations.map(({scope, operation, external}) =>
            this.generateLocalOperation(scope, operation, external),
          )}
        }
      `;
    } else {
      const implementsString =
        parentNames &&
        `implements ${parentNames.map(t =>
          this.generateComplexType(scope, t, false, true),
        )}`;

      const proxyImplementsString =
        parentNames &&
        `implements ${parentNames.map(
          t => `${this.generateComplexType(scope, t, false, true)}Prx`,
        )}`;

      return render`
        ${this.generateDocComment(declaration)}
        abstract class ${declaration.name}
        extends Ice.Object
        ${implementsString} {
          ${allOperations.map(({scope, operation, external}) =>
            this.generateOperation(scope, operation, external),
          )}
        }

        ${this.generateDocComment(declaration)}
        class ${declaration.name}Prx
        extends Ice.ObjectPrx
        ${proxyImplementsString} {
          ${allOperations.map(({scope, operation, external}) =>
            this.generateProxyOperation(scope, operation, external),
          )}
        }
      `;
    }
  }

  /**
   * @param external if true, all types are resolved to fully-qualified
   */
  private generateLocalOperation(
    scope: TypeScope,
    operation: slice2json.OperationDeclaration,
    external: boolean,
  ): string {
    const parameters = this.generateLocalParameters(scope, operation, external);
    const returnType = this.generateReturnType(scope, operation, external);

    return render`
      ${this.generateDocComment(operation)}
      ${operation.name}(${parameters}): ${returnType};
    `;
  }

  /**
   * @param external if true, parameter types are resolved to fully-qualified
   */
  private generateLocalParameters(
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
      const dataType = this.generateDataType(
        scope,
        parameter.dataType,
        external,
      );

      if (parameter.optional != null) {
        if (seenRequired) {
          reversedParamStrings.push(
            `${parameter.name}: ${dataType} | undefined`,
          );
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
  private generateOperation(
    scope: TypeScope,
    operation: slice2json.OperationDeclaration,
    external: boolean,
  ): string {
    const parameters = this.generateParameters(scope, operation, external);
    const returnType = this.generateReturnType(scope, operation, external);

    const resultType = `Ice.OperationResult<${returnType}>`;

    return render`
      ${this.generateDocComment(operation)}
      abstract ${operation.name}(${parameters}): ${resultType};
    `;
  }

  /**
   * @param external if true, parameter types are resolved to fully-qualified
   */
  private generateParameters(
    scope: TypeScope,
    operation: slice2json.OperationDeclaration,
    external: boolean,
  ): string {
    const parameterStrings: string[] = [];

    for (const parameter of operation.parameters) {
      if (parameter.out) {
        continue;
      }

      const dataType = this.generateDataType(
        scope,
        parameter.dataType,
        external,
      );

      let paramString = `${parameter.name}: ${dataType}`;

      if (parameter.optional != null) {
        paramString += ' | undefined';
      }

      parameterStrings.push(paramString);
    }

    const currentName = operation.parameters.some(
      param => param.name === 'current',
    )
      ? '_current'
      : 'current';

    parameterStrings.push(`${currentName}: Ice.Current`);

    return parameterStrings.join(', ');
  }

  /**
   * @param external if true, all types are resolved to fully-qualified
   */
  private generateProxyOperation(
    scope: TypeScope,
    operation: slice2json.OperationDeclaration,
    external: boolean,
  ): string {
    return render`
      ${this.generateDocComment(operation)}
      ${operation.name}(${this.generateProxyParameters(
      scope,
      operation,
      external,
    )}):
        Ice.AsyncResult<${this.generateReturnType(scope, operation, external)}>;
    `;
  }

  /**
   * @param external if true, parameter types are resolved to fully-qualified
   */
  private generateProxyParameters(
    scope: TypeScope,
    operation: slice2json.OperationDeclaration,
    external: boolean,
  ): string {
    const reversedParameters = operation.parameters
      .filter(parameter => !parameter.out)
      .reverse();

    const contextName = operation.parameters.some(param => param.name === 'ctx')
      ? '_ctx'
      : 'ctx';

    const reversedParamStrings = [`${contextName}?: Ice.Context`];
    let seenRequired = false;

    for (const parameter of reversedParameters) {
      const dataType = this.generateDataType(
        scope,
        parameter.dataType,
        external,
      );

      if (parameter.optional != null) {
        if (seenRequired) {
          reversedParamStrings.push(
            `${parameter.name}: ${dataType} | undefined`,
          );
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
  private generateReturnType(
    scope: TypeScope,
    operation: slice2json.OperationDeclaration,
    external: boolean,
  ) {
    const outParameters = operation.parameters.filter(
      parameter => parameter.out,
    );

    if (outParameters.length === 0) {
      const returnType = this.generateDataType(
        scope,
        operation.returnType,
        external,
      );
      return operation.returnOptional ? `${returnType} | void` : returnType;
    } else {
      const returnType = this.generateDataType(
        scope,
        operation.returnType,
        external,
      );

      const returnTypes: string[] = [
        operation.returnOptional ? `${returnType} | undefined` : returnType,
      ];

      for (const outParameter of outParameters) {
        const parameterType = this.generateDataType(
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

  private generateException(
    scope: TypeScope,
    declaration: slice2json.ExceptionDeclaration,
  ): string {
    const base = declaration.extends
      ? this.generateComplexType(scope, declaration.extends, false, true)
      : declaration.local ? 'Ice.LocalException' : 'Ice.UserException';

    return render`
      ${this.generateDocComment(declaration)}
      class ${declaration.name} extends ${base} {
        ${this.generateClassConstructor(scope, declaration)}

        ${declaration.content.map(field =>
          this.generateClassField(scope, field),
        )}
      }
    `;
  }

  private generateStruct(
    scope: TypeScope,
    declaration: slice2json.StructDeclaration,
  ): string {
    const parameters: string[] = [];
    const fields: string[] = [];

    for (const field of declaration.fields) {
      const dataType = this.generateDataType(scope, field.dataType);

      parameters.push(`${field.name}?: ${dataType}`);
      fields.push(render`
        ${this.generateDocComment(field)}
        ${field.name}: ${dataType};
      `);
    }

    return render`
      ${this.generateDocComment(declaration)}
      class ${declaration.name} implements Ice.Struct {
        constructor(${parameters.join(', ')});

        ${fields}

        clone(): this;
        equals(other: this): boolean;
        hashCode(): number;
      }
    `;
  }

  private generateEnum(
    scope: TypeScope,
    declaration: slice2json.EnumDeclaration,
  ): string {
    const names = declaration.enums.map(element => `'${element.name}'`);
    const namesType = `${declaration.name}Name`;

    return render`
      type ${namesType} = ${names.join(' | ')};

      ${this.generateDocComment(declaration)}
      class ${declaration.name}<Name extends ${namesType} = ${namesType}>
      extends Ice.EnumBase<Name> {
        ${declaration.enums.map(
          element => render`
            ${this.generateDocComment(element)}
            static ${element.name}: ${declaration.name}<'${element.name}'>;
          `,
        )}
      }
    `;
  }

  private generateSequence(
    scope: TypeScope,
    declaration: slice2json.SequenceDeclaration,
  ): string {
    const dataType = this.generateDataType(scope, declaration.dataType);

    return render`
      ${this.generateDocComment(declaration)}
      type ${declaration.name} = Array<${dataType}>;
    `;
  }

  private generateDictionary(
    scope: TypeScope,
    declaration: slice2json.DictionaryDeclaration,
  ): string {
    const keyType = this.generateDataType(scope, declaration.keyType);
    const valueType = this.generateDataType(scope, declaration.valueType);

    const isBuiltIn =
      keyType === 'boolean' || keyType === 'string' || keyType === 'number';

    const container = isBuiltIn ? 'Map' : 'Ice.HashMap';

    return render`
      ${this.generateDocComment(declaration)}
      type ${declaration.name} = ${container}<${keyType}, ${valueType}>;
    `;
  }

  private generateConstant(
    scope: TypeScope,
    declaration: slice2json.ConstDeclaration,
  ): string {
    const dataType = this.generateDataType(scope, declaration.dataType);

    return render`
      ${this.generateDocComment(declaration)}
      const ${declaration.name}: ${dataType};
    `;
  }
}
