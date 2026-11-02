/**
 * Boolean keyword search (RC-23) — turns a recruiter query like
 *
 *   python AND (aws OR gcp) NOT intern "data engineer" -contract
 *
 * into a SQL boolean expression. Each bare term or "quoted phrase" becomes
 * one predicate produced by `termToSql` (which must bind the value as a
 * parameter — this module never interpolates user text). Adjacent terms are
 * implicitly ANDed; `-term` is shorthand for NOT. Operators are
 * case-insensitive. Unbalanced parentheses and dangling operators are
 * tolerated rather than rejected.
 */

type Token =
  | { type: 'term'; value: string }
  | { type: 'and' | 'or' | 'not' | 'lparen' | 'rparen' };

export function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  const re = /"([^"]*)"|(\()|(\))|(-)(?=\S)|([^\s()"]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query))) {
    if (m[1] !== undefined) {
      if (m[1].trim()) tokens.push({ type: 'term', value: m[1].trim() });
    } else if (m[2]) tokens.push({ type: 'lparen' });
    else if (m[3]) tokens.push({ type: 'rparen' });
    else if (m[4]) tokens.push({ type: 'not' });
    else if (m[5]) {
      const word = m[5];
      const upper = word.toUpperCase();
      if (upper === 'AND' || word === '&&') tokens.push({ type: 'and' });
      else if (upper === 'OR' || word === '||') tokens.push({ type: 'or' });
      else if (upper === 'NOT') tokens.push({ type: 'not' });
      else tokens.push({ type: 'term', value: word });
    }
  }
  return tokens;
}

export function buildBooleanSearch(query: string, termToSql: (term: string) => string): string | null {
  const tokens = tokenize(query);
  let pos = 0;
  const peek = () => tokens[pos];

  // expr := and (OR and)*
  function parseOr(): string | null {
    const parts: string[] = [];
    let left = parseAnd();
    if (left) parts.push(left);
    while (peek()?.type === 'or') {
      pos++;
      left = parseAnd();
      if (left) parts.push(left);
    }
    if (!parts.length) return null;
    return parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`;
  }

  // and := unary ((AND)? unary)*
  function parseAnd(): string | null {
    const parts: string[] = [];
    for (;;) {
      const t = peek();
      if (!t || t.type === 'or' || t.type === 'rparen') break;
      if (t.type === 'and') {
        pos++;
        continue;
      }
      const u = parseUnary();
      if (u) parts.push(u);
    }
    if (!parts.length) return null;
    return parts.length === 1 ? parts[0] : `(${parts.join(' AND ')})`;
  }

  // unary := NOT unary | '(' expr ')' | term
  function parseUnary(): string | null {
    const t = peek();
    if (!t) return null;
    if (t.type === 'not') {
      pos++;
      const inner = parseUnary();
      return inner ? `NOT ${inner}` : null;
    }
    if (t.type === 'lparen') {
      pos++;
      const inner = parseOr();
      if (peek()?.type === 'rparen') pos++;
      return inner ? `(${inner})` : null;
    }
    if (t.type === 'term') {
      pos++;
      return termToSql(t.value);
    }
    pos++; // stray operator — skip it
    return null;
  }

  const parts: string[] = [];
  while (pos < tokens.length) {
    const expr = parseOr();
    if (expr) parts.push(expr);
    if (peek()?.type === 'rparen') pos++; // unbalanced ')'
  }
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : `(${parts.join(' AND ')})`;
}
