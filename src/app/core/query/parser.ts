import { type ComparisonType, type Token, lex } from './lexer';
import { CARD_PROPERTIES } from '../models/power-card';

export type Filter = And | Or | Not | Text | Regex | PropFilter;

export interface And {
  kind: 'and';
  a: Filter;
  b: Filter;
}

export interface Or {
  kind: 'or';
  a: Filter;
  b: Filter;
}

export interface Not {
  kind: 'not';
  filter: Filter;
}

export interface Text {
  kind: 'text';
  text: string;
}

export interface Regex {
  kind: 'regex';
  regex: string;
}

export interface PropFilter {
  kind: 'propfilter';
  property: string;
  filter: Text | Regex | NumFilter;
}

export interface NumFilter {
  kind: 'numfilter';
  typ: ComparisonType;
  number: number;
}

type PropValueFilter = NumFilter | Text | Regex | PropAnd | PropOr | PropNot;

interface PropAnd {
  kind: 'propand';
  a: PropValueFilter;
  b: PropValueFilter;
}

interface PropOr {
  kind: 'propor';
  a: PropValueFilter;
  b: PropValueFilter;
}

interface PropNot {
  kind: 'propnot';
  filter: PropValueFilter;
}

enum BinOpPrecedence {
  Lowest = 0,
  Paren = 1,
  Or = 2,
  And = 3,
  Highest = 4,
}

type ParseResult<T> = { index: number; result: T } | null;

export function parseFilters(s: string): Filter | null {
  const tokens = lex(s);
  const filterRes = parseFiltersWithPrecedence(BinOpPrecedence.Lowest, 0, tokens);
  if (filterRes == null) {
    return null;
  }
  return filterRes.result;
}

function parseFiltersWithPrecedence(
  currentPrecedence: BinOpPrecedence,
  index: number,
  tokens: Token[],
): ParseResult<Filter> {
  const wsResult = consumeWhitespace(index, tokens);
  if (wsResult == null) {
    return null;
  }
  ({ index } = wsResult);

  if (eof(index, tokens)) {
    return null;
  }

  const not = tokens[index]!.kind === 'bang';
  if (not) {
    index++;
    if (eof(index, tokens)) {
      return null;
    }
  }

  let lhs: Filter;
  const token = tokens[index]!;
  switch (token.kind) {
    case 'openparen': {
      const filterRes = parseFiltersWithPrecedence(BinOpPrecedence.Paren, index + 1, tokens);
      if (filterRes == null) {
        return null;
      }
      ({ index, result: lhs } = filterRes);
      if (eof(index, tokens)) {
        return null;
      }
      if (tokens[index]!.kind !== 'closeparen') {
        console.error('Unclosed parenthesis at ' + token.span[0]);
      } else {
        index++;
      }
      break;
    }
    case 'closeparen':
      if (currentPrecedence === BinOpPrecedence.Lowest) {
        console.error('Unmatched close parenthesis in filter list at ' + token.span[0]);
      }
      return null;
    default: {
      const filterResult = parseFilter(index, tokens);
      if (filterResult == null) {
        return null;
      }
      ({ index, result: lhs } = filterResult);
    }
  }

  if (not) {
    lhs = { kind: 'not', filter: lhs };
  }

  while (true) {
    let rhs: Filter;
    if (eof(index, tokens)) {
      return { index, result: lhs };
    }
    const binOpToken = tokens[index]!;
    switch (binOpToken.kind) {
      case 'whitespace': {
        const ws2Result = consumeWhitespace(index, tokens);
        if (ws2Result == null) {
          throw new Error('unreachable');
        }
        ({ index } = ws2Result);
        const wsRhsResult = parseFiltersWithPrecedence(BinOpPrecedence.And, index, tokens);
        if (wsRhsResult == null) {
          continue;
        }
        if (currentPrecedence > BinOpPrecedence.And) {
          return { index, result: lhs };
        }
        ({ index, result: rhs } = wsRhsResult);
        lhs = { kind: 'and', a: lhs, b: rhs };
        continue;
      }
      case 'comma': {
        if (currentPrecedence > BinOpPrecedence.And) {
          return { index, result: lhs };
        }
        const andRhsResult = parseFiltersWithPrecedence(BinOpPrecedence.And, index + 1, tokens);
        if (andRhsResult == null) {
          return { index, result: lhs };
        }
        ({ index, result: rhs } = andRhsResult);
        lhs = { kind: 'and', a: lhs, b: rhs };
        continue;
      }
      case 'pipe': {
        if (currentPrecedence > BinOpPrecedence.Or) {
          return { index, result: lhs };
        }
        const orRhsResult = parseFiltersWithPrecedence(BinOpPrecedence.Or, index + 1, tokens);
        if (orRhsResult == null) {
          return { index, result: lhs };
        }
        ({ index, result: rhs } = orRhsResult);
        lhs = { kind: 'or', a: lhs, b: rhs };
        continue;
      }
      case 'closeparen':
        if (currentPrecedence === BinOpPrecedence.Lowest) {
          console.error('Unmatched close parenthesis in filter list at ' + binOpToken.span[0]);
        }
        return { index, result: lhs };
      case 'openparen':
      case 'int':
      case 'comparison':
      case 'word':
      case 'dqstring':
      case 'bang':
      case 'colon':
      case 'regex':
        console.error("invalid token '" + binOpToken.kind + "' at " + binOpToken.span[0]);
        return { index, result: lhs };
      default:
        return assertNever(binOpToken);
    }
  }
}

function parseFilter(index: number, tokens: Token[]): ParseResult<Filter> {
  const propRes = parsePropertyFilter(index, tokens);
  if (propRes != null) {
    return propRes;
  }

  const textResult = parseText(index, tokens);
  if (textResult != null) {
    const { index: newIndex, result: text } = textResult;
    return { index: newIndex, result: { kind: 'text', text } };
  }

  const regexResult = parseRegex(index, tokens);
  if (regexResult == null) {
    return null;
  }
  const { index: newIndex, result: regex } = regexResult;
  return { index: newIndex, result: { kind: 'regex', regex } };
}

function parsePropertyFilter(index: number, tokens: Token[]): ParseResult<Filter> {
  const res = applyParseFunctions(
    index,
    tokens,
    parseWord,
    consumeWhitespace,
    checkTokenKind.bind(null, 'colon'),
    consumeWhitespace,
    parsePropertyFilterValueList.bind(null, BinOpPrecedence.Lowest),
  );
  if (res == null) {
    return null;
  }

  const {
    index: newIndex,
    result: [property, , , , valueFilterList],
  } = res;
  if (!CARD_PROPERTIES.includes(property as (typeof CARD_PROPERTIES)[number])) {
    console.error(
      "Unknown card property '" + property + "'\nAllowed properties are: " + CARD_PROPERTIES.join(', '),
    );
  }
  index = newIndex;

  function convertPropertyFilter(
    propertyName: string,
    filter: PropValueFilter,
  ): PropFilter | Not | And | Or {
    switch (filter.kind) {
      case 'numfilter':
      case 'text':
      case 'regex':
        return { kind: 'propfilter', property: propertyName, filter };
      case 'propand':
        return {
          kind: 'and',
          a: convertPropertyFilter(propertyName, filter.a),
          b: convertPropertyFilter(propertyName, filter.b),
        };
      case 'propor':
        return {
          kind: 'or',
          a: convertPropertyFilter(propertyName, filter.a),
          b: convertPropertyFilter(propertyName, filter.b),
        };
      case 'propnot':
        return { kind: 'not', filter: convertPropertyFilter(propertyName, filter.filter) };
      default:
        return assertNever(filter);
    }
  }

  return { index, result: convertPropertyFilter(property as string, valueFilterList as PropValueFilter) };
}

function parsePropertyFilterValueList(
  currentPrecedence: BinOpPrecedence,
  index: number,
  tokens: Token[],
): ParseResult<PropValueFilter> {
  let lhs: PropValueFilter;
  if (eof(index, tokens)) {
    return null;
  }

  const not = tokens[index]!.kind === 'bang';
  if (not) {
    index++;
    if (eof(index, tokens)) {
      return null;
    }
  }

  const token = tokens[index]!;
  switch (token.kind) {
    case 'openparen': {
      const filterRes = parsePropertyFilterValueList(BinOpPrecedence.Paren, index + 1, tokens);
      if (filterRes == null) {
        return null;
      }
      ({ index, result: lhs } = filterRes);
      if (eof(index, tokens)) {
        return null;
      }
      if (tokens[index]!.kind !== 'closeparen') {
        console.error('Unclosed parenthesis at ' + token.span[0]);
      } else {
        index++;
      }
      break;
    }
    case 'closeparen':
      if (currentPrecedence === BinOpPrecedence.Lowest) {
        console.error('Unmatched close parenthesis in property value list at ' + token.span[0]);
      }
      return null;
    default: {
      const valueRes = parsePropertyFilterValue(index, tokens);
      if (valueRes == null) {
        return null;
      }
      ({ index, result: lhs } = valueRes);
    }
  }

  if (not) {
    lhs = { kind: 'propnot', filter: lhs };
  }

  while (true) {
    if (eof(index, tokens)) {
      return { index, result: lhs };
    }

    let rhs: PropValueFilter;
    const binOpToken = tokens[index]!;
    switch (binOpToken.kind) {
      case 'comma': {
        if (currentPrecedence > BinOpPrecedence.And) {
          return { index, result: lhs };
        }
        const andRhsResult = parsePropertyFilterValueList(BinOpPrecedence.And, index + 1, tokens);
        if (andRhsResult == null) {
          return { index, result: lhs };
        }
        ({ index, result: rhs } = andRhsResult);
        lhs = { kind: 'propand', a: lhs, b: rhs };
        continue;
      }
      case 'pipe': {
        if (currentPrecedence > BinOpPrecedence.Or) {
          return { index, result: lhs };
        }
        const orRhsResult = parsePropertyFilterValueList(BinOpPrecedence.Or, index + 1, tokens);
        if (orRhsResult == null) {
          return { index, result: lhs };
        }
        ({ index, result: rhs } = orRhsResult);
        lhs = { kind: 'propor', a: lhs, b: rhs };
        continue;
      }
      case 'whitespace':
        return { index, result: lhs };
      case 'closeparen':
        if (currentPrecedence === BinOpPrecedence.Lowest) {
          console.error('Unmatched close parenthesis in property value list at ' + token.span[0]);
        }
        return { index, result: lhs };
      case 'openparen':
      case 'int':
      case 'comparison':
      case 'word':
      case 'dqstring':
      case 'bang':
      case 'colon':
      case 'regex':
        console.error("invalid token '" + binOpToken.kind + "' at " + binOpToken.span[0]);
        return { index, result: lhs };
      default:
        return assertNever(binOpToken);
    }
  }
}

function parsePropertyFilterValue(
  index: number,
  tokens: Token[],
): ParseResult<NumFilter | Text | Regex | PropNot> {
  if (eof(index, tokens)) {
    return null;
  }
  const not = tokens[index]!.kind === 'bang';
  if (not) {
    index++;
    if (eof(index, tokens)) {
      return null;
    }
  }

  let filter: NumFilter | Text | Regex | PropNot;

  const numberFilterRes = parseNumberFilter(index, tokens);
  if (numberFilterRes != null) {
    ({ index, result: filter } = numberFilterRes);
  } else {
    const textRes = parseText(index, tokens);
    if (textRes != null) {
      let text: string;
      ({ index, result: text } = textRes);
      filter = { kind: 'text', text };
    } else {
      const regexRes = parseRegex(index, tokens);
      if (regexRes == null) {
        return null;
      }
      let regex: string;
      ({ index, result: regex } = regexRes);
      filter = { kind: 'regex', regex };
    }
  }

  if (not) {
    filter = { kind: 'propnot', filter };
  }
  return { index, result: filter };
}

function parseNumberFilter(index: number, tokens: Token[]): ParseResult<NumFilter> {
  if (eof(index, tokens)) {
    return null;
  }

  const token = tokens[index]!;
  switch (token.kind) {
    case 'int':
      return {
        index: index + 1,
        result: { kind: 'numfilter', typ: '==', number: token.number },
      };
    case 'comparison': {
      if (eof(index + 1, tokens)) {
        return null;
      }
      const numberToken = tokens[index + 1]!;
      if (numberToken.kind === 'int') {
        return {
          index: index + 2,
          result: { kind: 'numfilter', typ: token.typ, number: numberToken.number },
        };
      }
      return null;
    }
    default:
      return null;
  }
}

function parseText(index: number, tokens: Token[]): ParseResult<string> {
  if (eof(index, tokens)) {
    return null;
  }
  const text = tokens[index]!;
  switch (text.kind) {
    case 'dqstring':
    case 'word':
      return { index: index + 1, result: text.text };
    default:
      return null;
  }
}

function parseWord(index: number, tokens: Token[]): ParseResult<string> {
  if (eof(index, tokens)) {
    return null;
  }
  const token = tokens[index]!;
  if (token.kind === 'word') {
    return { index: index + 1, result: token.text };
  }
  return null;
}

function parseRegex(index: number, tokens: Token[]): ParseResult<string> {
  if (eof(index, tokens)) {
    return null;
  }
  const token = tokens[index]!;
  if (token.kind === 'regex') {
    return { index: index + 1, result: token.regex };
  }
  return null;
}

function checkTokenKind(expectedKind: string, index: number, tokens: Token[]): ParseResult<void> {
  if (eof(index, tokens)) {
    return null;
  }
  if (tokens[index]!.kind !== expectedKind) {
    return null;
  }
  return { index: index + 1, result: undefined };
}

function consumeWhitespace(index: number, tokens: Token[]): ParseResult<boolean> {
  let hasWhitespace = false;
  while (!eof(index, tokens) && tokens[index]!.kind === 'whitespace') {
    hasWhitespace = true;
    index++;
  }
  return { index, result: hasWhitespace };
}

function eof(index: number, arr: Token[]): boolean {
  return index >= arr.length;
}

type ParseFunction<T> = (index: number, tokens: Token[]) => ParseResult<T>;

function applyParseFunctions(
  index: number,
  tokens: Token[],
  ...funcs: Array<ParseFunction<unknown> | undefined>
): ParseResult<unknown[]> {
  const returnValues: unknown[] = [];
  for (const func of funcs) {
    if (!func) {
      break;
    }
    const res = func(index, tokens);
    if (res == null) {
      return null;
    }
    let result: unknown;
    ({ index, result } = res);
    returnValues.push(result);
  }
  return { index, result: returnValues };
}

function assertNever(x: never): never {
  throw new Error('Unexpected Object: ' + JSON.stringify(x));
}
