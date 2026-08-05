export type ComparisonType = '<' | '<=' | '==' | '>=' | '>';

export type Token =
  | { kind: 'dqstring'; span: [number, number]; text: string }
  | { kind: 'word'; span: [number, number]; text: string }
  | { kind: 'regex'; span: [number, number]; regex: string }
  | { kind: 'int'; span: [number, number]; number: number }
  | { kind: 'comparison'; span: [number, number]; typ: ComparisonType }
  | { kind: 'colon'; span: [number, number] }
  | { kind: 'bang'; span: [number, number] }
  | { kind: 'comma'; span: [number, number] }
  | { kind: 'pipe'; span: [number, number] }
  | { kind: 'whitespace'; span: [number, number] }
  | { kind: 'openparen'; span: [number, number] }
  | { kind: 'closeparen'; span: [number, number] };

interface LexResult<T> {
  index: number;
  result: T;
}

export function comparisonTypeToString(c: ComparisonType): string {
  return c;
}

export function lex(s: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (!eof(index, s)) {
    const { index: next, result: token } = lexToken(index, s);
    tokens.push(token);
    index = next;
  }

  return tokens;
}

function lexToken(index: number, s: string): LexResult<Token> {
  switch (true) {
    case s[index] === '"':
      return lexDoubleQuotedString(index, s);
    case s[index] === '!':
      return { index: index + 1, result: { kind: 'bang', span: [index, index + 1] } };
    case s[index] === ':':
      return { index: index + 1, result: { kind: 'colon', span: [index, index + 1] } };
    case s[index] === ',':
      return { index: index + 1, result: { kind: 'comma', span: [index, index + 1] } };
    case s[index] === '|':
      return { index: index + 1, result: { kind: 'pipe', span: [index, index + 1] } };
    case s[index] === '(':
      return { index: index + 1, result: { kind: 'openparen', span: [index, index + 1] } };
    case s[index] === ')':
      return { index: index + 1, result: { kind: 'closeparen', span: [index, index + 1] } };
    case s[index] === '/': {
      const regex = lexRegex(index, s);
      if (regex == null) {
        return lexWord(index, s);
      }
      return regex;
    }
    case /\s/.test(s[index]):
      return lexWhitespace(index, s);
    case /\d/.test(s[index]):
      return lexInteger(index, s);
    case /[<=>]/.test(s[index]):
      return lexComparison(index, s);
    default:
      return lexWord(index, s);
  }
}

function lexRegex(index: number, s: string): LexResult<Token> | null {
  if (s[index] !== '/') {
    throw new Error('lexRegExp called without leading slash character');
  }
  const start = index;
  index += 1;
  while (!eof(index, s) && s[index] !== '/') {
    ({ index } = consumePossiblyEscapedChar(index, s));
  }
  if (s[index] !== '/') {
    return null;
  }
  index++;
  return {
    index,
    result: {
      kind: 'regex',
      span: [start, index],
      regex: s.substring(start + 1, index - 1),
    },
  };
}

function lexDoubleQuotedString(index: number, s: string): LexResult<Token> {
  if (s[index] !== '"') {
    throw new Error('lexDoubleQuotedString called without leading double-quote character');
  }
  const dqStringStart = index;
  index += 1;
  const textStart = index;
  while (!eof(index, s) && s[index] !== '"') {
    ({ index } = consumePossiblyEscapedChar(index, s));
  }
  const textEnd = index;
  index += 1;
  return {
    index,
    result: {
      kind: 'dqstring',
      span: [dqStringStart, index],
      text: s.substring(textStart, textEnd),
    },
  };
}

function consumePossiblyEscapedChar(index: number, s: string): LexResult<undefined> {
  if (s[index] === '\\') {
    if (eof(index + 1, s)) {
      return { index: index + 1, result: undefined };
    }
    return { index: index + 2, result: undefined };
  }
  return { index: index + 1, result: undefined };
}

function lexWord(index: number, s: string): LexResult<Token> {
  const startIndex = index;
  const { index: newIndex, result: word } = matchRegex(index, s, /[^:,|()\s]/);
  return {
    index: newIndex,
    result: { kind: 'word', span: [startIndex, newIndex], text: word },
  };
}

function lexComparison(index: number, s: string): LexResult<Token> {
  if (s[index] === '<') {
    if (!eof(index + 1, s) && s[index + 1] === '=') {
      return {
        index: index + 2,
        result: { kind: 'comparison', span: [index, index + 2], typ: '<=' },
      };
    }
    return {
      index: index + 1,
      result: { kind: 'comparison', span: [index, index + 1], typ: '<' },
    };
  }
  if (s[index] === '=') {
    return {
      index: index + 1,
      result: { kind: 'comparison', span: [index, index + 1], typ: '==' },
    };
  }
  if (s[index] === '>') {
    if (!eof(index + 1, s) && s[index + 1] === '=') {
      return {
        index: index + 2,
        result: { kind: 'comparison', span: [index, index + 2], typ: '>=' },
      };
    }
    return {
      index: index + 1,
      result: { kind: 'comparison', span: [index, index + 1], typ: '>' },
    };
  }
  throw new Error('lexComparison called without a comparison operator');
}

function lexInteger(index: number, s: string): LexResult<Token> {
  const startIndex = index;
  const { index: newIndex, result: word } = matchRegex(index, s, /\d/);
  return {
    index: newIndex,
    result: {
      kind: 'int',
      span: [startIndex, newIndex],
      number: parseInt(word, 10),
    },
  };
}

function lexWhitespace(index: number, s: string): LexResult<Token> {
  const startIndex = index;
  const { index: newIndex, result: ws } = matchRegex(index, s, /\s/);
  if (ws.length === 0) {
    throw new Error('lexWhitespace called without whitespace');
  }
  return {
    index: newIndex,
    result: { kind: 'whitespace', span: [startIndex, newIndex] },
  };
}

function matchRegex(index: number, s: string, regex: RegExp): LexResult<string> {
  let consumed = 0;
  while (regex.test(s[index]!)) {
    index += 1;
    consumed += 1;
    if (eof(index, s)) {
      break;
    }
  }
  return { index, result: s.substring(index - consumed, index) };
}

function eof(index: number, s: string): boolean {
  return index >= s.length;
}
