import {isBlank, isPresent, FunctionWrapper, BaseException} from "angular2/src/facade/lang";
import {List, Map, ListWrapper, StringMapWrapper} from "angular2/src/facade/collection";

// HACK: workaround for Traceur behavior.
// It expects all transpiled modules to contain this marker.
// TODO: remove this when we no longer use traceur
export var __esModule = true;

export class AST {
  eval(context, locals) { throw new BaseException("Not supported"); }

  get isAssignable(): boolean { return false; }

  assign(context, locals, value) { throw new BaseException("Not supported"); }

  visit(visitor): any { return null; }

  toString(): string { return "AST"; }
}

export class EmptyExpr extends AST {
  eval(context, locals) { return null; }

  visit(visitor) {
    // do nothing
  }
}

export class ImplicitReceiver extends AST {
  eval(context, locals) { return context; }

  visit(visitor) { return visitor.visitImplicitReceiver(this); }
}

/**
 * Multiple expressions separated by a semicolon.
 */
export class Chain extends AST {
  constructor(public expressions: List<any>) { super(); }

  eval(context, locals) {
    var result;
    for (var i = 0; i < this.expressions.length; i++) {
      var last = this.expressions[i].eval(context, locals);
      if (isPresent(last)) result = last;
    }
    return result;
  }

  visit(visitor) { return visitor.visitChain(this); }
}

export class Conditional extends AST {
  constructor(public condition: AST, public trueExp: AST, public falseExp: AST) { super(); }

  eval(context, locals) {
    if (this.condition.eval(context, locals)) {
      return this.trueExp.eval(context, locals);
    } else {
      return this.falseExp.eval(context, locals);
    }
  }

  visit(visitor) { return visitor.visitConditional(this); }
}

export class AccessMember extends AST {
  constructor(public receiver: AST, public name: string, public getter: Function,
              public setter: Function) {
    super();
  }

  eval(context, locals) {
    if (this.receiver instanceof ImplicitReceiver && isPresent(locals) &&
                                     locals.contains(this.name)) {
      return locals.get(this.name);
    } else {
      var evaluatedReceiver = this.receiver.eval(context, locals);
      return this.getter(evaluatedReceiver);
    }
  }

  get isAssignable(): boolean { return true; }

  assign(context, locals, value) {
    var evaluatedContext = this.receiver.eval(context, locals);

    if (this.receiver instanceof ImplicitReceiver && isPresent(locals) &&
                                     locals.contains(this.name)) {
      throw new BaseException(`Cannot reassign a variable binding ${this.name}`);
    } else {
      return this.setter(evaluatedContext, value);
    }
  }

  visit(visitor) { return visitor.visitAccessMember(this); }
}

export class KeyedAccess extends AST {
  constructor(public obj: AST, public key: AST) { super(); }

  eval(context, locals) {
    var obj: any = this.obj.eval(context, locals);
    var key: any = this.key.eval(context, locals);
    return obj[key];
  }

  get isAssignable(): boolean { return true; }

  assign(context, locals, value) {
    var obj: any = this.obj.eval(context, locals);
    var key: any = this.key.eval(context, locals);
    obj[key] = value;
    return value;
  }

  visit(visitor) { return visitor.visitKeyedAccess(this); }
}

export class Pipe extends AST {
  constructor(public exp: AST, public name: string, public args: List<any>,
              public inBinding: boolean) {
    super();
  }

  visit(visitor) { return visitor.visitPipe(this); }
}

export class LiteralPrimitive extends AST {
  constructor(public value) { super(); }

  eval(context, locals) { return this.value; }

  visit(visitor) { return visitor.visitLiteralPrimitive(this); }
}

export class LiteralArray extends AST {
  constructor(public expressions: List<any>) { super(); }

  eval(context, locals) {
    return ListWrapper.map(this.expressions, (e) => e.eval(context, locals));
  }

  visit(visitor) { return visitor.visitLiteralArray(this); }
}

export class LiteralMap extends AST {
  constructor(public keys: List<any>, public values: List<any>) { super(); }

  eval(context, locals) {
    var res = StringMapWrapper.create();
    for (var i = 0; i < this.keys.length; ++i) {
      StringMapWrapper.set(res, this.keys[i], this.values[i].eval(context, locals));
    }
    return res;
  }

  visit(visitor) { return visitor.visitLiteralMap(this); }
}

export class Interpolation extends AST {
  constructor(public strings: List<any>, public expressions: List<any>) { super(); }

  eval(context, locals) { throw new BaseException("evaluating an Interpolation is not supported"); }

  visit(visitor) { visitor.visitInterpolation(this); }
}

export class Binary extends AST {
  constructor(public operation: string, public left: AST, public right: AST) { super(); }

  eval(context, locals) {
    var left: any = this.left.eval(context, locals);
    switch (this.operation) {
      case '&&':
        return left && this.right.eval(context, locals);
      case '||':
        return left || this.right.eval(context, locals);
    }
    var right: any = this.right.eval(context, locals);

    switch (this.operation) {
      case '+':
        return left + right;
      case '-':
        return left - right;
      case '*':
        return left * right;
      case '/':
        return left / right;
      case '%':
        return left % right;
      case '==':
        return left == right;
      case '!=':
        return left != right;
      case '===':
        return left === right;
      case '!==':
        return left !== right;
      case '<':
        return left < right;
      case '>':
        return left > right;
      case '<=':
        return left <= right;
      case '>=':
        return left >= right;
      case '^':
        return left ^ right;
      case '&':
        return left & right;
    }
    throw 'Internal error [$operation] not handled';
  }

  visit(visitor) { return visitor.visitBinary(this); }
}

export class PrefixNot extends AST {
  constructor(public expression: AST) { super(); }

  eval(context, locals) { return !this.expression.eval(context, locals); }

  visit(visitor) { return visitor.visitPrefixNot(this); }
}

export class Assignment extends AST {
  constructor(public target: AST, public value: AST) { super(); }

  eval(context, locals) {
    return this.target.assign(context, locals, this.value.eval(context, locals));
  }

  visit(visitor) { return visitor.visitAssignment(this); }
}

export class MethodCall extends AST {
  constructor(public receiver: AST, public name: string, public fn: Function,
              public args: List<any>) {
    super();
  }

  eval(context, locals) {
    var evaluatedArgs = evalList(context, locals, this.args);
    if (this.receiver instanceof ImplicitReceiver && isPresent(locals) &&
                                     locals.contains(this.name)) {
      var fn = locals.get(this.name);
      return FunctionWrapper.apply(fn, evaluatedArgs);
    } else {
      var evaluatedReceiver = this.receiver.eval(context, locals);
      return this.fn(evaluatedReceiver, evaluatedArgs);
    }
  }

  visit(visitor) { return visitor.visitMethodCall(this); }
}

export class FunctionCall extends AST {
  constructor(public target: AST, public args: List<any>) { super(); }

  eval(context, locals) {
    var obj: any = this.target.eval(context, locals);
    if (!(obj instanceof Function)) {
      throw new BaseException(`${obj} is not a function`);
    }
    return FunctionWrapper.apply(obj, evalList(context, locals, this.args));
  }

  visit(visitor) { return visitor.visitFunctionCall(this); }
}

export class ASTWithSource extends AST {
  constructor(public ast: AST, public source: string, public location: string) { super(); }

  eval(context, locals) { return this.ast.eval(context, locals); }

  get isAssignable(): boolean { return this.ast.isAssignable; }

  assign(context, locals, value) { return this.ast.assign(context, locals, value); }

  visit(visitor) { return this.ast.visit(visitor); }

  toString(): string { return `${this.source} in ${this.location}`; }
}

export class TemplateBinding {
  constructor(public key: string, public keyIsVar: boolean, public name: string,
              public expression: ASTWithSource) {}
}

// INTERFACE
export class AstVisitor {
  visitAccessMember(ast: AccessMember) {}
  visitAssignment(ast: Assignment) {}
  visitBinary(ast: Binary) {}
  visitChain(ast: Chain) {}
  visitConditional(ast: Conditional) {}
  visitPipe(ast: Pipe) {}
  visitFunctionCall(ast: FunctionCall) {}
  visitImplicitReceiver(ast: ImplicitReceiver) {}
  visitKeyedAccess(ast: KeyedAccess) {}
  visitLiteralArray(ast: LiteralArray) {}
  visitLiteralMap(ast: LiteralMap) {}
  visitLiteralPrimitive(ast: LiteralPrimitive) {}
  visitMethodCall(ast: MethodCall) {}
  visitPrefixNot(ast: PrefixNot) {}
}

export class AstTransformer {
  visitImplicitReceiver(ast: ImplicitReceiver) { return ast; }

  visitInterpolation(ast: Interpolation) {
    return new Interpolation(ast.strings, this.visitAll(ast.expressions));
  }

  visitLiteralPrimitive(ast: LiteralPrimitive) { return new LiteralPrimitive(ast.value); }

  visitAccessMember(ast: AccessMember) {
    return new AccessMember(ast.receiver.visit(this), ast.name, ast.getter, ast.setter);
  }

  visitMethodCall(ast: MethodCall) {
    return new MethodCall(ast.receiver.visit(this), ast.name, ast.fn, this.visitAll(ast.args));
  }

  visitFunctionCall(ast: FunctionCall) {
    return new FunctionCall(ast.target.visit(this), this.visitAll(ast.args));
  }

  visitLiteralArray(ast: LiteralArray) { return new LiteralArray(this.visitAll(ast.expressions)); }

  visitLiteralMap(ast: LiteralMap) { return new LiteralMap(ast.keys, this.visitAll(ast.values)); }

  visitBinary(ast: Binary) {
    return new Binary(ast.operation, ast.left.visit(this), ast.right.visit(this));
  }

  visitPrefixNot(ast: PrefixNot) { return new PrefixNot(ast.expression.visit(this)); }

  visitConditional(ast: Conditional) {
    return new Conditional(ast.condition.visit(this), ast.trueExp.visit(this),
                           ast.falseExp.visit(this));
  }

  visitPipe(ast: Pipe) {
    return new Pipe(ast.exp.visit(this), ast.name, this.visitAll(ast.args), ast.inBinding);
  }

  visitKeyedAccess(ast: KeyedAccess) {
    return new KeyedAccess(ast.obj.visit(this), ast.key.visit(this));
  }

  visitAll(asts: List<any>) {
    var res = ListWrapper.createFixedSize(asts.length);
    for (var i = 0; i < asts.length; ++i) {
      res[i] = asts[i].visit(this);
    }
    return res;
  }
}

var _evalListCache = [
  [],
  [0],
  [0, 0],
  [0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0]
];

function evalList(context, locals, exps: List<any>) {
  var length = exps.length;
  if (length > 10) {
    throw new BaseException("Cannot have more than 10 argument");
  }

  var result = _evalListCache[length];
  for (var i = 0; i < length; i++) {
    result[i] = exps[i].eval(context, locals);
  }
  return result;
}
