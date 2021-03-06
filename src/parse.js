/* @flow */
import _ from 'lodash';
import { filter } from './filter';

function isNumber(ch: ?string): boolean {
  if (ch == null) return false;
  return ch >= '0' && ch <= '9';
}

function isExpOperator(ch: ?string): boolean {
  return ch === '-' || ch === '+' || isNumber(ch);
}

function isIdentifier(ch: ?string): boolean {
  if (typeof ch !== 'string') return false;
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$';
}

function isWhiteSpace(ch: ?string) {
  return ch === ' ' || ch === '\r' || ch === '\t' ||
    ch === '\n' || ch === '\v' || ch === '\u00A0';
}

const ESCAPE_MAP: { [key: string]: string } = {
  'n': '\n',
  'f': '\f',
  'r': '\r',
  't': '\t',
  'v': '\v',
  '\'': '\'',
  '"': '"'
};

const OperatorsMap: { [key: string]: true } = {
  '+': true,
  '!': true,
  '-': true,
  '*': true,
  '/': true,
  '%': true,
  '=': true,
  '==': true,
  '!=': true,
  '===': true,
  '!==': true,
  '<': true,
  '>': true,
  '<=': true,
  '>=': true,
  '&&': true,
  '||': true,
  '|': true
};

const stringEscapeRegex: RegExp = /[^ a-zA-Z0-9]/g;

function stringEscapeFn(ch: string) {
  const unicode = `0000${ch.charCodeAt(0).toString(16)}`;
  return `\\u${unicode.slice(-4)}`;
}

function escape<T>(value: T): T | string {
  if (typeof value === 'string') {
    return `'${value.replace(stringEscapeRegex, stringEscapeFn)}'`;
  } else if (value === null) {
    return 'null';
  }
  return value;
}

type LexToken = {
  text: string,
  value?: any,
  identifier?: boolean
};

class Lexer {
  text: string;
  index: number;
  tokens: LexToken[];

  readNumber() {
    let number: string = '';
    while (this.index < this.text.length) {
      const ch = this.text.charAt(this.index).toLocaleLowerCase();
      if (ch === '.' || isNumber(ch)) {
        number += ch;
      } else {
        const nextCh = this.peek();
        const prevCh = number[number.length - 1];
        if (ch === 'e' && isExpOperator(nextCh)) {
          number += ch;
        } else if (prevCh === 'e' && isExpOperator(ch) && nextCh && isNumber(nextCh)) {
          number += ch;
        } else if (isExpOperator(ch) && prevCh === 'e' && (!nextCh || !isNumber(nextCh))) {
          throw new Error('Invalid exponent');
        } else {
          break;
        }
      }
      this.index++;
    }
    this.tokens.push({
      text: number,
      value: _.toNumber(number)
    });
  }

  readString(quote: string) {
    this.index++;
    let str: string = '';
    let rawString: string = '';
    let escape: boolean = false;
    while (this.index < this.text.length) {
      const ch = this.text.charAt(this.index);
      rawString += ch;
      if (escape) {
        if (ch === 'u') {
          const hex = this.peek(4);
          this.index += 4;
          if (hex == null || !hex.match(/[\da-f]{4}/i)) {
            throw new Error('Invalid unicode escape');
          }
          str += String.fromCharCode(parseInt(hex, 16));
        } else {
          const replacement = ESCAPE_MAP[ch];
          if (replacement) {
            str += replacement;
          } else {
            str += ch;
          }
        }
        escape = false;
      } else if (ch === quote) {
        this.index++;
        this.tokens.push({
          text: rawString,
          value: str
        });
        return;
      } else if (ch === '\\') {
        escape = true;
      } else {
        str += ch;
      }
      this.index++;
    }
    throw new Error('Unmatched Quote');
  }

  readIdentifier() {
    let text = '';
    while (this.index < this.text.length) {
      const ch = this.text.charAt(this.index);
      if (isIdentifier(ch) || isNumber(ch)) {
        text += ch;
      } else {
        break;
      }
      this.index++;
    }
    this.tokens.push({
      text,
      identifier: true
    });
  }

  lex(text: string): LexToken[] {
    this.text = text;
    this.index = 0;
    this.tokens = [];

    while (this.index < this.text.length) {
      const ch = this.text.charAt(this.index);
      if (isNumber(ch) ||
        (ch === '.' && isNumber(this.peek()))) {
        this.readNumber();
      } else if (_.includes('\'"', ch)) {
        this.readString(ch);
      } else if (_.includes('[],{}:.()?;', ch)) {
        this.tokens.push({
          text: ch
        });
        this.index++;
      } else if (isIdentifier(ch)) {
        this.readIdentifier();
      } else if (isWhiteSpace(ch)) {
        this.index++;
      } else {
        const nextStrings: Array<string> = [ch];
        [1, 2].forEach(offset => {
          const nextChars = this.peek(offset);
          if (nextChars) {
            nextStrings.push(ch + nextChars);
          }
        });
        const findOp: ?string = _.findLast(nextStrings, chars => OperatorsMap[chars]);
        if (findOp) {
          this.tokens.push({ text: findOp });
          this.index += findOp.length;
        } else {
          throw new Error(`Unexpected next character: ${ch}`);
        }
      }
    }

    return this.tokens;
  }

  peek(offset: number = 1): ?string {
    if (this.index > this.text.length - offset) {
      return null;
    }
    return this.text.substr(this.index + 1, offset);
  }
}

interface ASTNode {
  constant: boolean;
  toWatch: ASTNode[];
}

class ASTProgramNode {
  body: ASTNode[];
  constant: boolean;
  toWatch: ASTNode[];
  constructor(body: ASTNode[]) {
    this.constant = body.every(n => n.constant);
    this.body = body;
  }
}

class ASTLiteralNode {
  value: any;
  constant: boolean = true;
  toWatch: ASTNode[] = [];
  constructor(value: any) {
    this.value = value;
  }
}

class ASTArrayExpressionNode {
  elements: ASTNode[];
  constant: boolean;
  toWatch: ASTNode[];
  constructor(elements: ASTNode[]) {
    const [constant, nonConstant] = _.partition(elements, n => n.constant);
    this.constant = constant.length === elements.length;
    this.elements = elements;
    this.toWatch = _.flatMap(nonConstant, n => n.toWatch);
  }
}

type ObjectProperty = {
  key: ASTLiteralNode | ASTIdentifierNode,
  value: ASTNode
};

class ASTObjectNode {
  properties: ObjectProperty[];
  constant: boolean;
  toWatch: ASTNode[];
  constructor(properties: ObjectProperty[]) {
    const [valueConstant, valueNonConstant] = _.partition(properties, p => p.value.constant);
    this.constant = valueConstant.length === properties.length;
    this.toWatch = _.flatMap(valueNonConstant, n => n.value.toWatch);
    this.properties = properties;
  }
}

class ASTIdentifierNode {
  name: string;
  constant: boolean = false;
  toWatch: ASTNode[];
  constructor(name: string) {
    this.name = name;
    this.toWatch = [this];
  }
}

class ASTThisExpressionNode {
  constant: boolean = false;
  toWatch: ASTNode[] = [];
}

class ASTNonComputedMemberExpressionNode {
  object: ASTNode;
  property: ASTIdentifierNode;
  constant: boolean;
  toWatch: ASTNode[];
  constructor(object: ASTNode, property: ASTIdentifierNode) {
    this.constant = object.constant;
    this.object = object;
    this.property = property;
    this.toWatch = [this];
  }
}

class ASTComputedMemberExpressionNode {
  object: ASTNode;
  property: ASTNode;
  constant: boolean;
  toWatch: ASTNode[];
  constructor(object: ASTNode, property: ASTNode) {
    this.constant = object.constant && property.constant;
    this.toWatch = [this];
    this.object = object;
    this.property = property;
  }
}

class ASTCallExpressionNode {
  callee: ASTNode;
  arguments: ASTNode[];
  constant: boolean = false;
  toWatch: ASTNode[];
  constructor(callee: ASTNode, args: ASTNode[]) {
    this.callee = callee;
    this.arguments = args;
    this.toWatch = [this];
  }
}

class ASTFilterExpressionNode {
  callee: ASTIdentifierNode;
  arguments: ASTNode[];
  constant: boolean;
  toWatch: ASTNode[];
  constructor(callee: ASTIdentifierNode, args: ASTNode[]) {
    const stateless = !(filter(callee.name).$stateful);
    this.constant = stateless && _.every(args, n => n.constant);
    this.callee = callee;
    this.arguments = args;
    this.toWatch = stateless ? _.flatMap(args, n => n.toWatch) : [this];
  }
}

class ASTAssignmentExpressionNode {
  left: ASTNode;
  right: ASTNode;
  constant: boolean;
  toWatch: ASTNode[];
  constructor(left: ASTNode, right: ASTNode) {
    this.constant = left.constant && right.constant;
    this.left = left;
    this.right = right;
    this.toWatch = [this];
  }
}

class ASTUnaryExpressionNode {
  operator: string;
  argument: ASTNode;
  constant: boolean;
  toWatch: ASTNode[];
  constructor(operator: string, argument: ASTNode) {
    this.constant = argument.constant;
    this.operator = operator;
    this.argument = argument;
    this.toWatch = argument.toWatch;
  }
}

class ASTBinaryExpressionNode {
  operator: string;
  left: ASTNode;
  right: ASTNode;
  constant: boolean;
  toWatch: ASTNode[];
  constructor(operator: string, left: ASTNode, right: ASTNode) {
    this.constant = left.constant && right.constant;
    this.left = left;
    this.right = right;
    this.operator = operator;
    this.toWatch = [...left.toWatch, ...right.toWatch];
  }
}

class ASTLogicalExpressionNode {
  operator: string;
  left: ASTNode;
  right: ASTNode;
  constant: boolean;
  toWatch: ASTNode[];
  constructor(operator: string, left: ASTNode, right: ASTNode) {
    this.constant = left.constant && right.constant;
    this.left = left;
    this.right = right;
    this.operator = operator;
    this.toWatch = [this];
  }
}

class ASTConditionalExpressionNode {
  test: ASTNode;
  consequent: ASTNode;
  alternate: ASTNode;
  constant: boolean;
  toWatch: ASTNode[];
  constructor(test: ASTNode, consequent: ASTNode, alternate: ASTNode) {
    this.constant = test.constant && consequent.constant && alternate.constant;
    this.test = test;
    this.consequent = consequent;
    this.alternate = alternate;
    this.toWatch = [this];
  }
}

class ASTNGValueParamter {
  constant: boolean = false;
  toWatch: ASTNode[] = [];
}

const LanguageConstants: { [key: string]: (ASTThisExpressionNode | ASTLiteralNode) } = {
  'this': new ASTThisExpressionNode(),
  'null': new ASTLiteralNode(null),
  'true': new ASTLiteralNode(true),
  'false': new ASTLiteralNode(false),
  'undefined': new ASTLiteralNode(undefined)
};

class AST {
  lexer: Lexer;
  tokens: LexToken[];

  constructor(lexer: Lexer) {
    this.lexer = lexer;
  }

  peek(...expectations: Array<?string>): ?LexToken {
    if (this.tokens.length > 0) {
      const text = this.tokens[0].text;
      if (_.includes(expectations, text) || _.every(expectations, _.isNil)) {
        return this.tokens[0];
      }
    }
  }

  expect(...expectations: Array<?string>): ?LexToken {
    const token = this.peek(...expectations);
    if (token) {
      return this.tokens.shift();
    }
  }

  consume(e: ?string): LexToken {
    const token = this.expect(e);
    if (!token) {
      throw new Error(`Unexpected. Expected ${e}`);
    }
    return token;
  }

  ast(text): ASTProgramNode {
    this.tokens = this.lexer.lex(text);
    return this.program();
  }

  program(): ASTProgramNode {
    const body: ASTNode[] = [];
    do {
      if (this.tokens.length) {
        body.push(this.filter());
      }
    } while (this.expect(';'));
    return new ASTProgramNode(body);
  }

  computedMemberExpression(object: ASTNode): ASTComputedMemberExpressionNode {
    const property: ASTNode = this.primary();
    this.consume(']');
    return new ASTComputedMemberExpressionNode(object, property);
  }

  nonComputedMemberExpression(object: ASTNode): ASTNonComputedMemberExpressionNode {
    const property = this.identifier();
    return new ASTNonComputedMemberExpressionNode(object, property);
  }

  callExpression(callee: ASTNode): ASTCallExpressionNode {
    const args: ASTNode[] = [];
    if (!this.peek(')')) {
      do {
        args.push(this.assignment());
      } while (this.expect(','));
    }
    this.consume(')');
    return new ASTCallExpressionNode(callee, args);
  }

  assignment(): ASTNode {
    const left = this.ternary();
    if (this.expect('=')) {
      const right = this.ternary();
      return new ASTAssignmentExpressionNode(left, right);
    }
    return left;
  }

  primary(): ASTNode {
    let primary: ASTNode;
    if (this.expect('(')) {
      primary = this.filter();
      this.consume(')');
    } else if (this.expect('[')) {
      primary = this.arrayDeclaration();
    } else if (this.expect('{')) {
      primary = this.object();
    } else if (_.has(LanguageConstants, this.tokens[0].text)) {
      primary = LanguageConstants[this.consume().text];
    } else {
      const peek = this.peek();
      if (peek && peek.identifier) {
        primary = this.identifier();
      } else {
        primary = this.constant();
      }
    }
    let next: ?LexToken;
    while ((next = this.expect('.', '[', '('))) {
      if (next.text === '[') {
        primary = this.computedMemberExpression(primary);
      } else if (next.text === '.') {
        primary = this.nonComputedMemberExpression(primary);
      } else if (next.text === '(') {
        primary = this.callExpression(primary);
      }
    }
    return primary;
  }

  object(): ASTObjectNode {
    const properties: ObjectProperty[] = [];
    if (!this.peek('}')) {
      do {
        const peek = this.peek();
        if (peek == null) {
          throw new Error('Unexpected terminates.');
        }
        const key = peek.identifier ? this.identifier() : this.constant();
        this.consume(':');
        const value = this.assignment();
        properties.push({
          key,
          value
        });
      } while (this.expect(','));
    }
    this.consume('}');
    return new ASTObjectNode(properties);
  }

  arrayDeclaration(): ASTArrayExpressionNode {
    const elements: ASTNode[] = [];
    if (!this.peek(']')) {
      do {
        if (this.peek(']')) {
          break;
        }
        elements.push(this.assignment());
      } while (this.expect(','));
    }
    this.consume(']');
    return new ASTArrayExpressionNode(elements);
  }

  constant(): ASTLiteralNode {
    const node = this.consume();
    return new ASTLiteralNode(node.value);
  }

  identifier(): ASTIdentifierNode {
    const node = this.consume();
    if (!node.identifier) {
      throw new Error(`Tokenize Error: ${node.text} is not an identifier`);
    }
    return new ASTIdentifierNode(node.text);
  }

  unary(): ASTNode {
    const token = this.expect('+', '!', '-');
    if (token) {
      const argument = this.unary();
      return new ASTUnaryExpressionNode(token.text, argument);
    } else {
      return this.primary();
    }
  }

  multiplicative(): ASTNode {
    let left: ASTNode = this.unary();
    let token: ?LexToken;
    while ((token = this.expect('*', '/', '%'))) {
      const right = this.unary();
      left = new ASTBinaryExpressionNode(token.text, left, right);
    }
    return left;
  }

  additive(): ASTNode {
    let left: ASTNode = this.multiplicative();
    let token: ?LexToken;
    while ((token = this.expect('+', '-'))) {
      const right = this.multiplicative();
      left = new ASTBinaryExpressionNode(token.text, left, right);
    }
    return left;
  }

  equality(): ASTNode {
    let left: ASTNode = this.relational();
    let token: ?LexToken;
    while ((token = this.expect('==', '!=', '===', '!=='))) {
      const right = this.relational();
      left = new ASTBinaryExpressionNode(token.text, left, right);
    }
    return left;
  }

  relational(): ASTNode {
    let left: ASTNode = this.additive();
    let token: ?LexToken;
    while ((token = this.expect('<', '>', '>=', '<='))) {
      const right = this.additive();
      left = new ASTBinaryExpressionNode(token.text, left, right);
    }
    return left;
  }

  logicalAND(): ASTNode {
    let left: ASTNode = this.equality();
    let token: ?LexToken;
    while ((token = this.expect('&&'))) {
      const right = this.equality();
      left = new ASTLogicalExpressionNode(token.text, left, right);
    }
    return left;
  }

  logicalOR(): ASTNode {
    let left: ASTNode = this.logicalAND();
    let token: ?LexToken;
    while ((token = this.expect('||'))) {
      const right = this.logicalAND();
      left = new ASTLogicalExpressionNode(token.text, left, right);
    }
    return left;
  }

  ternary(): ASTNode {
    const test = this.logicalOR();
    if (this.expect('?')) {
      const consequent = this.assignment();
      if (this.consume(':')) {
        const alternate = this.assignment();
        return new ASTConditionalExpressionNode(test, consequent, alternate);
      }
    }
    return test;
  }

  filter(): ASTNode {
    let left: ASTNode = this.assignment();
    while (this.expect('|')) {
      const args: ASTNode[] = [left];
      const callee = this.identifier();
      while (this.expect(':')) {
        args.push(this.assignment());
      }
      left = new ASTFilterExpressionNode(callee, args);
    }
    return left;
  }

  static isLiteral(ast: ASTProgramNode): boolean {
    const body = ast.body;
    return body.length === 0 ||
      (body.length === 1 &&
          (body[0] instanceof ASTLiteralNode ||
            body[0] instanceof ASTArrayExpressionNode ||
            body[0] instanceof ASTObjectNode));
  }

  static getInputs(ast: ASTProgramNode): ASTNode[] {
    const body = ast.body;
    if (body.length !== 1) {
      return [];
    }
    const candidate = body[0].toWatch;
    if (candidate.length !== 1 || candidate[0] !== body[0]) {
      return candidate;
    }
    return [];
  }

  static isAssignable(ast: ASTNode) {
    return ast instanceof ASTIdentifierNode || ast instanceof ASTNonComputedMemberExpressionNode || ast instanceof ASTComputedMemberExpressionNode;
  }

  static assignableAST(ast: ASTProgramNode): ?ASTAssignmentExpressionNode {
    const body = ast.body;
    if (body.length === 1 && AST.isAssignable(body[0])) {
      return new ASTAssignmentExpressionNode(body[0], new ASTNGValueParamter());
    }
  }
}

function ensureSafeMemberName(name: string) {
  if (_.includes(['constructor', '__proto__', '__defineGetter__',
    '__defineSetter__', '__lookupGetter__', '__lookupSetter__'], name)) {
    throw new Error('Attempting to access a disallowed field');
  }
}

function isDOMNode(o: any): boolean {
  return (
    typeof Node === 'object' ? o instanceof Node
      : o && typeof o === 'object' && typeof o.nodeType === 'number' && typeof o.nodeName === 'string'
  );
}

function ensureSafeObject<T>(obj: T): T {
  if (obj) {
    // should not use obj === window, may be tricked by Object.create(window)
    if (obj.document && obj.location && obj.alert && obj.setTimeout) {
      throw new Error('Referencing window is not allowed');
    } else if ((obj: any).constructor === obj) {
      throw new Error('Referencing Function is not allowed');
    } else if (obj.getOwnPropertyNames || obj.getOwnPropertyDescriptor) {
      throw new Error('Referencing Object is not allowed');
    } else if (isDOMNode(obj)) {
      throw new Error('Referencing DOM node is not allowed');
    }
  }
  return obj;
}

function ensureSafeFunction<T>(obj: T): T {
  if (obj) {
    if ((obj: any).constructor === obj) {
      throw new Error('Referencing Function is not allowed');
    } else if (obj === Function.prototype.call ||
      obj === Function.prototype.apply ||
      obj === Function.prototype.bind) {
      throw new Error('Referencing call, apply or bind is not allowed');
    }
  }
  return obj;
}

function isDefined<U, V>(value: U, defaultValue: V): U | V {
  return typeof value === 'undefined' ? defaultValue : value;
}

type ASTCompilerState = {
  functions: { [k: string]: { body: string[], vars: string[] } },
  nextId: number,
  filters: { [k: string]: string },
  computing: string,
  inputs: string[],
  stage: 'main' | 'inputs' | 'assign'
};

type CallContext = {
  context?: string,
  name?: string,
  computed?: boolean
};

class ASTCompiler {
  state: ASTCompilerState;
  astBuilder: AST;

  constructor(astBuilder: AST) {
    this.astBuilder = astBuilder;
  }

  compile(text: string): ParsedFunction {
    const ast: ASTProgramNode = this.astBuilder.ast(text);
    this.state = {
      nextId: 0,
      filters: {},
      functions: { fn: { body: [], vars: [] }, assign: { body: [], vars: [] } },
      inputs: [],
      computing: 'fn',
      stage: 'main'
    };

    this.state.stage = 'inputs';
    _.each(AST.getInputs(ast), (input, index) => {
      const inputKey = 'fn' + index;
      this.state.functions[inputKey] = { body: [], vars: [] };
      this.state.computing = inputKey;
      this.state.functions[inputKey].body.push(`return ${this.recurse(input)};`);
      this.state.inputs.push(inputKey);
    });

    this.state.stage = 'assign';
    const assignable = AST.assignableAST(ast);
    let extra = 'fn.assign = function () {};';
    if (assignable) {
      this.state.computing = 'assign';
      this.state.functions.assign.body.push(this.recurse(assignable));
      extra = `fn.assign = function (s, v, l) {
        ${this.state.functions.assign.vars.length ? `var ${this.state.functions.assign.vars.join(',')};` : ''}
        ${this.state.functions.assign.body.join('')}
      };`;
    }

    this.state.computing = 'fn';
    this.state.stage = 'main';
    this.recurse(ast);

    // s means scope, l means locals
    const fnString = `
    ${this.filterPrefix()}
    var fn = function(s, l) {
      ${this.state.functions.fn.vars.length ? `var ${this.state.functions.fn.vars.join(',')};` : ''}
      ${this.state.functions.fn.body.join('')}
    };
    ${this.watchFns()}
    ${extra}
    return fn;
    `;
    /* eslint-disable no-new-func */
    const fn = new Function(
      'ensureSafeMemberName',
      'ensureSafeObject',
      'ensureSafeFunction',
      'filter',
      'isDefined',
      fnString)(
      ensureSafeMemberName,
      ensureSafeObject,
      ensureSafeFunction,
      filter,
      isDefined);
    /* eslint-enable no-new-func */
    (fn: any).literal = AST.isLiteral(ast);
    (fn: any).constant = ast.constant;
    return (fn: any);
  }

  watchFns(): string {
    const result = this.state.inputs.map(inputName => {
      return `var ${inputName} = function (s) {
        ${this.state.functions[inputName].vars.length ? `var ${this.state.functions[inputName].vars.join(',')};` : ''}
        ${this.state.functions[inputName].body.join('')}
      };`;
    });
    if (result.length) {
      result.push(`fn.inputs = [${this.state.inputs.join(',')}];`);
    }
    return result.join('');
  }

  filterPrefix(): string {
    if (_.isEmpty(this.state.filters)) {
      return '';
    } else {
      const parts = _.map(this.state.filters,
        (varName, filterName) => `${varName} = filter(${escape(filterName)})`);
      return `var ${parts.join(',')};`;
    }
  }

  filter(name: string): string {
    if (!_.has(this.state.filters, name)) {
      this.state.filters[name] = this.nextId(true);
    }
    return this.state.filters[name];
  }

  nextId(skip: boolean = false): string {
    const id = `$$vv${this.state.nextId++}`;
    if (!skip) {
      this.state.functions[this.state.computing].vars.push(id);
    }
    return id;
  }

  recurse(ast: ASTNode, inContext?: CallContext, create?: boolean): any {
    let varId: string;
    if (ast instanceof ASTLiteralNode) {
      return escape(ast.value);
    } else if (ast instanceof ASTProgramNode) {
      _.each(_.initial(ast.body), stmt => {
        this.state.functions[this.state.computing].body.push(this.recurse(stmt), ';');
      });
      this.state.functions[this.state.computing].body.push(`return ${this.recurse(_.last(ast.body))};`);
    } else if (ast instanceof ASTArrayExpressionNode) {
      const elements = _.map(ast.elements, element => this.recurse(element));
      return `[${elements.join(',')}]`;
    } else if (ast instanceof ASTObjectNode) {
      const properties = _.map(ast.properties, property => {
        const key = property.key instanceof ASTIdentifierNode
          ? property.key.name : escape(property.key.value);
        const value = this.recurse(property.value);
        return `${key}:${value}`;
      });
      return `{${properties.join(',')}}`;
    } else if (ast instanceof ASTIdentifierNode) {
      ensureSafeMemberName(ast.name);
      varId = this.nextId();
      let localsCheck: string;
      if (this.state.stage === 'inputs') {
        localsCheck = 'false';
      } else {
        localsCheck = ASTCompiler.getHasOwnProperty('l', ast.name);
      }
      this.if_(
        localsCheck,
        ASTCompiler.assign(varId, ASTCompiler.nonComputedMember('l', ast.name)));
      if (create) {
        this.if_(
          `${ASTCompiler.not(localsCheck)}
          && s && ${ASTCompiler.not(ASTCompiler.getHasOwnProperty('s', ast.name))}`,
          ASTCompiler.assign(ASTCompiler.nonComputedMember('s', ast.name), '{}'));
      }
      this.if_(
        `${ASTCompiler.not(localsCheck)} && s`,
        ASTCompiler.assign(varId, ASTCompiler.nonComputedMember('s', ast.name)));
      if (inContext) {
        inContext.context = `${localsCheck} ? l : s`;
        inContext.name = ast.name;
        inContext.computed = false;
      }
      this.addEnsureSafeObject(varId);
      return varId;
    } else if (ast instanceof ASTThisExpressionNode) {
      return 's';
    } else if (ast instanceof ASTComputedMemberExpressionNode) {
      varId = this.nextId();
      const left = this.recurse(ast.object, undefined, create);
      if (inContext) {
        inContext.context = left;
      }
      const right = this.recurse(ast.property);
      this.addEnsureSafeMemberName(right);
      if (create) {
        const computedMember = ASTCompiler.computedMember(left, right);
        this.if_(
          ASTCompiler.not(computedMember),
          ASTCompiler.assign(computedMember, '{}'));
      }
      this.if_(left,
        ASTCompiler.assign(varId,
          `ensureSafeObject(${ASTCompiler.computedMember(left, right)})`));
      if (inContext) {
        inContext.computed = true;
        inContext.name = right;
      }
      return varId;
    } else if (ast instanceof ASTNonComputedMemberExpressionNode) {
      varId = this.nextId();
      const left = this.recurse(ast.object, undefined, create);
      if (inContext) {
        inContext.context = left;
      }
      ensureSafeMemberName(ast.property.name);
      if (create) {
        const nonComputedMember = ASTCompiler.nonComputedMember(left, ast.property.name);
        this.if_(
          ASTCompiler.not(nonComputedMember),
          ASTCompiler.assign(nonComputedMember, '{}'));
      }
      this.if_(left,
        ASTCompiler.assign(varId,
          `ensureSafeObject(${ASTCompiler.nonComputedMember(left, ast.property.name)})`));
      if (inContext) {
        inContext.computed = false;
        inContext.name = ast.property.name;
      }
      return varId;
    } else if (ast instanceof ASTCallExpressionNode) {
      const callContext: CallContext = {};
      let callee = this.recurse(ast.callee, callContext);
      const args = _.map(ast.arguments,
        arg => `ensureSafeObject(${this.recurse(arg)})`);
      if (callContext.context && callContext.name) {
        if (callContext.computed) {
          callee = ASTCompiler.computedMember(callContext.context, callContext.name);
        } else {
          callee = ASTCompiler.nonComputedMember(callContext.context, callContext.name);
        }
        this.addEnsureSafeObject(callContext.context);
      }
      this.addEnsureSafeFunction(callee);
      return `${callee} && ensureSafeObject(${callee}(${args.join(',')}))`;
    } else if (ast instanceof ASTFilterExpressionNode) {
      const callee = this.filter(ast.callee.name);
      const args = _.map(ast.arguments, arg => this.recurse(arg));
      return `${callee}(${args})`;
    } else if (ast instanceof ASTAssignmentExpressionNode) {
      const leftContext: CallContext = {};
      this.recurse(ast.left, leftContext, true);
      let leftExpr: ?string;
      if (leftContext.context && leftContext.name) {
        if (leftContext.computed) {
          leftExpr = ASTCompiler.computedMember(leftContext.context, leftContext.name);
        } else {
          leftExpr = ASTCompiler.nonComputedMember(leftContext.context, leftContext.name);
        }
      }
      if (leftExpr == null) {
        throw new Error(`Unable to get leftContext info: ${JSON.stringify(leftContext)}`);
      }
      return ASTCompiler.assign(leftExpr,
        `ensureSafeObject(${this.recurse(ast.right)})`);
    } else if (ast instanceof ASTUnaryExpressionNode) {
      return `${ast.operator}(${ASTCompiler.isDefined(this.recurse(ast.argument), 0)})`;
    } else if (ast instanceof ASTBinaryExpressionNode) {
      if (ast.operator === '+' || ast.operator === '-') {
        return `(${ASTCompiler.isDefined(this.recurse(ast.left), 0)}) ${ast.operator} (${ASTCompiler.isDefined(this.recurse(ast.right), 0)})`;
      }
      return `(${this.recurse(ast.left)}) ${ast.operator} (${this.recurse(ast.right)})`;
    } else if (ast instanceof ASTLogicalExpressionNode) {
      varId = this.nextId();
      this.state.functions[this.state.computing].body.push(ASTCompiler.assign(varId, this.recurse(ast.left)));
      this.if_(ast.operator === '&&' ? varId : ASTCompiler.not(varId),
        ASTCompiler.assign(varId, this.recurse(ast.right)));
      return varId;
    } else if (ast instanceof ASTConditionalExpressionNode) {
      varId = this.nextId();
      const testId = this.nextId();
      this.state.functions[this.state.computing].body.push(ASTCompiler.assign(testId, this.recurse(ast.test)));
      this.if_(testId,
        ASTCompiler.assign(varId, this.recurse(ast.consequent)));
      this.if_(ASTCompiler.not(testId),
        ASTCompiler.assign(varId, this.recurse(ast.alternate)));
      return varId;
    } else if (ast instanceof ASTNGValueParamter) {
      return 'v';
    } else {
      throw new Error('Unknown ASTNode Type');
    }
  }

  addEnsureSafeFunction(expr: string) {
    this.state.functions[this.state.computing].body.push(`ensureSafeFunction(${expr});`);
  }

  addEnsureSafeMemberName(expr: string) {
    this.state.functions[this.state.computing].body.push(`ensureSafeMemberName(${expr});`);
  }

  addEnsureSafeObject(expr: string) {
    this.state.functions[this.state.computing].body.push(`ensureSafeObject(${expr});`);
  }

  if_(test: string, consequent: string) {
    this.state.functions[this.state.computing].body.push(`if(${test}){${consequent}}`);
  }

  static isDefined(value: any, defaultValue: any): string {
    return `isDefined(${value}, ${escape(defaultValue)})`;
  }

  static computedMember(left: string, right: string): string {
    return `(${left})[${right}]`;
  }

  static nonComputedMember(left: string, right: string): string {
    return `(${left}).${right}`;
  }

  static assign(name: string, value: string): string {
    return `${name}=${value};`;
  }

  static not(name: string): string {
    return `!(${name})`;
  }

  static getHasOwnProperty(object: string, property: string): string {
    return `${object} && ${object}.hasOwnProperty(${escape(property)})`;
  }
}

class Parser {
  lexer: Lexer;
  ast: AST;
  astCompiler: ASTCompiler;

  constructor(lexer: Lexer) {
    this.lexer = lexer;
    this.ast = new AST(this.lexer);
    this.astCompiler = new ASTCompiler(this.ast);
  }

  parse(text): ParsedFunction {
    return this.astCompiler.compile(text);
  }
}

function parse(expr?: string | Function): ParsedFunction {
  switch (typeof expr) {
    case 'string':
      const lexer = new Lexer();
      const parser = new Parser(lexer);
      let oneTime = false;
      if (expr.charAt(0) === ':' && expr.charAt(1) === ':') {
        oneTime = true;
        expr = expr.substring(2);
      }
      const parsedFn = parser.parse(expr);
      parsedFn.oneTime = oneTime;
      return parsedFn;
    case 'function':
      return expr;
    default:
      return _.noop;
  }
}

export interface ParsedFunction {
  (scope?: any, locals?: any): any;
  literal?: boolean,
  constant?: boolean,
  oneTime?: boolean,
  inputs?: Function[],
  assign: Function
}

export default parse;
