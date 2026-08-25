/**
 * A small, dependency-free expression language for computed-expression
 * fields in the Schema Builder. Deliberately not a full formula engine —
 * it supports arithmetic and comparisons over other field keys, which is
 * enough to model things like `complexity_score * screen_time_minutes`.
 *
 * Grammar (highest to lowest precedence binds tightest):
 *   primary    := NUMBER | STRING | 'true' | 'false' | IDENT | '(' expr ')'
 *   unary      := ('!' | '-') unary | primary
 *   term       := unary (('*' | '/' | '%') unary)*
 *   additive   := term (('+' | '-') term)*
 *   comparison := additive (('>' | '>=' | '<' | '<=') additive)*
 *   equality   := comparison (('==' | '!=') comparison)*
 *   and        := equality ('&&' equality)*
 *   or         := and ('||' and)*
 *   expr       := or
 */

export type ExprValue = number | boolean | string;

type TokenType =
  "number" | "string" | "ident" | "op" | "lparen" | "rparen" | "eof";

interface Token {
  type: TokenType;
  value: string;
}

const OPERATORS = [
  "==",
  "!=",
  ">=",
  "<=",
  "&&",
  "||",
  ">",
  "<",
  "+",
  "-",
  "*",
  "/",
  "%",
  "!",
];

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen", value: ch });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen", value: ch });
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let str = "";
      while (j < input.length && input[j] !== quote) {
        str += input[j];
        j++;
      }
      if (input[j] !== quote)
        throw new Error(`Unterminated string literal at position ${i}`);
      tokens.push({ type: "string", value: str });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(input[i + 1] ?? ""))) {
      let j = i;
      let num = "";
      while (j < input.length && /[0-9.]/.test(input[j])) {
        num += input[j];
        j++;
      }
      tokens.push({ type: "number", value: num });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      let ident = "";
      while (j < input.length && /[a-zA-Z0-9_]/.test(input[j])) {
        ident += input[j];
        j++;
      }
      tokens.push({ type: "ident", value: ident });
      i = j;
      continue;
    }
    const two = input.slice(i, i + 2);
    if (OPERATORS.includes(two)) {
      tokens.push({ type: "op", value: two });
      i += 2;
      continue;
    }
    const one = input[i];
    if (OPERATORS.includes(one)) {
      tokens.push({ type: "op", value: one });
      i += 1;
      continue;
    }
    throw new Error(`Unexpected character "${ch}" at position ${i}`);
  }
  tokens.push({ type: "eof", value: "" });
  return tokens;
}

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private next(): Token {
    return this.tokens[this.pos++];
  }

  private expectOp(...ops: string[]): boolean {
    const t = this.peek();
    return t.type === "op" && ops.includes(t.value);
  }

  parse(scope: Record<string, ExprValue>): ExprValue {
    const result = this.parseOr(scope);
    if (this.peek().type !== "eof") {
      throw new Error(`Unexpected token "${this.peek().value}"`);
    }
    return result;
  }

  private parseOr(scope: Record<string, ExprValue>): ExprValue {
    let left = this.parseAnd(scope);
    while (this.expectOp("||")) {
      this.next();
      const right = this.parseAnd(scope);
      left = Boolean(left) || Boolean(right);
    }
    return left;
  }

  private parseAnd(scope: Record<string, ExprValue>): ExprValue {
    let left = this.parseEquality(scope);
    while (this.expectOp("&&")) {
      this.next();
      const right = this.parseEquality(scope);
      left = Boolean(left) && Boolean(right);
    }
    return left;
  }

  private parseEquality(scope: Record<string, ExprValue>): ExprValue {
    let left = this.parseComparison(scope);
    while (this.expectOp("==", "!=")) {
      const op = this.next().value;
      const right = this.parseComparison(scope);
      left = op === "==" ? left === right : left !== right;
    }
    return left;
  }

  private parseComparison(scope: Record<string, ExprValue>): ExprValue {
    let left = this.parseAdditive(scope);
    while (this.expectOp(">", ">=", "<", "<=")) {
      const op = this.next().value;
      const right = this.parseAdditive(scope);
      const l = Number(left);
      const r = Number(right);
      left =
        op === ">" ? l > r : op === ">=" ? l >= r : op === "<" ? l < r : l <= r;
    }
    return left;
  }

  private parseAdditive(scope: Record<string, ExprValue>): ExprValue {
    let left = this.parseTerm(scope);
    while (this.expectOp("+", "-")) {
      const op = this.next().value;
      const right = this.parseTerm(scope);
      if (
        op === "+" &&
        (typeof left === "string" || typeof right === "string")
      ) {
        left = `${left}${right}`;
      } else {
        left =
          op === "+"
            ? Number(left) + Number(right)
            : Number(left) - Number(right);
      }
    }
    return left;
  }

  private parseTerm(scope: Record<string, ExprValue>): ExprValue {
    let left = this.parseUnary(scope);
    while (this.expectOp("*", "/", "%")) {
      const op = this.next().value;
      const right = this.parseUnary(scope);
      const l = Number(left);
      const r = Number(right);
      left = op === "*" ? l * r : op === "/" ? l / r : l % r;
    }
    return left;
  }

  private parseUnary(scope: Record<string, ExprValue>): ExprValue {
    if (this.expectOp("!")) {
      this.next();
      return !this.parseUnary(scope);
    }
    if (this.expectOp("-")) {
      this.next();
      return -Number(this.parseUnary(scope));
    }
    return this.parsePrimary(scope);
  }

  private parsePrimary(scope: Record<string, ExprValue>): ExprValue {
    const t = this.next();
    if (t.type === "number") return parseFloat(t.value);
    if (t.type === "string") return t.value;
    if (t.type === "ident") {
      if (t.value === "true") return true;
      if (t.value === "false") return false;
      if (!(t.value in scope)) {
        throw new Error(`Unknown field reference "${t.value}"`);
      }
      return scope[t.value];
    }
    if (t.type === "lparen") {
      const expr = this.parseOr(scope);
      if (this.peek().type !== "rparen")
        throw new Error('Expected closing ")"');
      this.next();
      return expr;
    }
    throw new Error(`Unexpected token "${t.value}"`);
  }
}

export interface EvaluationResult {
  value: ExprValue | null;
  error: string | null;
}

/** Evaluate a small computed expression against a flat scope of field values. */
export function evaluateExpression(
  expression: string,
  scope: Record<string, ExprValue>,
): EvaluationResult {
  const trimmed = expression.trim();
  if (!trimmed) return { value: null, error: null };
  try {
    const tokens = tokenize(trimmed);
    const parser = new Parser(tokens);
    const value = parser.parse(scope);
    return { value, error: null };
  } catch (e) {
    return {
      value: null,
      error: e instanceof Error ? e.message : "Invalid expression",
    };
  }
}

/** Extract the set of identifiers (excluding true/false) referenced by an expression. */
export function extractFieldRefs(expression: string): string[] {
  try {
    const tokens = tokenize(expression);
    const refs = new Set<string>();
    for (const t of tokens) {
      if (t.type === "ident" && t.value !== "true" && t.value !== "false") {
        refs.add(t.value);
      }
    }
    return Array.from(refs);
  } catch {
    return [];
  }
}

export function formatExprValue(value: ExprValue | null): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number")
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return value;
}
