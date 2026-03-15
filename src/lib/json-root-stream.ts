import {
  type JsonValue,
  objectMapEntryKeyField,
  type PathToken,
  tokenizeJsonPath,
} from '@/lib/mapping-engine'

export interface StreamableJsonPath {
  rootPath: string
  tokens: PathToken[]
}

export interface JsonPathStreamProgress {
  processedCharacters: number
  totalCharacters: number
  yieldedRoots: number
}

export interface StreamJsonPathResult {
  matchedPath: boolean
  rootCount: number
}

export function resolveStreamableJsonPath(
  rootPath: string,
): StreamableJsonPath | null {
  const normalizedPath = rootPath.trim()

  if (!normalizedPath) {
    return null
  }

  return {
    rootPath: normalizedPath,
    tokens: tokenizeJsonPath(normalizedPath),
  }
}

export function streamJsonPath(
  text: string,
  rootPath: StreamableJsonPath | string,
  handlers: {
    onProgress?: (progress: JsonPathStreamProgress) => void
    onRoot: (value: JsonValue, rootIndex: number) => void
  },
): StreamJsonPathResult {
  const resolvedPath =
    typeof rootPath === 'string'
      ? resolveStreamableJsonPath(rootPath)
      : rootPath

  if (!resolvedPath) {
    throw new Error('Root path is not supported for incremental parsing.')
  }

  if (!text.trim()) {
    throw new Error('Paste JSON or upload a .json file.')
  }

  const parser = new JsonTextParser(text)
  let yieldedRoots = 0
  let lastReportedCharacters = -1

  const emitProgress = (force = false) => {
    if (!handlers.onProgress) {
      return
    }

    const processedCharacters = Math.min(parser.index, text.length)

    if (!force && processedCharacters === lastReportedCharacters) {
      return
    }

    lastReportedCharacters = processedCharacters
    handlers.onProgress({
      processedCharacters,
      totalCharacters: text.length,
      yieldedRoots,
    })
  }

  emitProgress(true)

  const matchedPath = streamJsonPathMatches(
    parser,
    resolvedPath.tokens,
    0,
    () => {
      emitProgress()
    },
    (value) => {
      handlers.onRoot(value, yieldedRoots)
      yieldedRoots += 1
      emitProgress(true)
    },
  )

  parser.skipWhitespace()

  if (!parser.isAtEnd()) {
    throw parser.error('Unexpected trailing content.')
  }

  emitProgress(true)

  return {
    matchedPath,
    rootCount: yieldedRoots,
  }
}

// Backward-compatible aliases for the earlier root-array-only milestone.
export const resolveStreamableRootArrayPath = resolveStreamableJsonPath
export const streamJsonRootArray = streamJsonPath

function streamJsonPathMatches(
  parser: JsonTextParser,
  tokens: PathToken[],
  tokenIndex: number,
  onAdvance: () => void,
  onMatch: (value: JsonValue) => void,
): boolean {
  parser.skipWhitespace()
  onAdvance()

  if (tokenIndex >= tokens.length) {
    onMatch(parser.parseValue())
    onAdvance()
    return true
  }

  const token = tokens[tokenIndex]

  if (token.type === 'property') {
    return streamObjectPropertyMatches(
      parser,
      token.value,
      tokens,
      tokenIndex + 1,
      onAdvance,
      onMatch,
    )
  }

  return streamArrayMatches(
    parser,
    token.type === 'wildcard' ? null : token.value,
    tokens,
    tokenIndex + 1,
    onAdvance,
    onMatch,
  )
}

function streamArrayMatches(
  parser: JsonTextParser,
  selectedIndex: number | null,
  tokens: PathToken[],
  tokenIndex: number,
  onAdvance: () => void,
  onMatch: (value: JsonValue) => void,
) {
  parser.skipWhitespace()

  if (parser.peek() !== '[') {
    parser.skipValue()
    onAdvance()
    return false
  }

  parser.expect('[')
  parser.skipWhitespace()
  onAdvance()

  if (parser.consumeIf(']')) {
    onAdvance()
    return false
  }

  let entryIndex = 0
  let matchedPath = false

  while (true) {
    if (selectedIndex === null || entryIndex === selectedIndex) {
      matchedPath =
        streamJsonPathMatches(parser, tokens, tokenIndex, onAdvance, onMatch) ||
        matchedPath
    } else {
      parser.skipValue()
      onAdvance()
    }

    parser.skipWhitespace()

    if (parser.consumeIf(']')) {
      onAdvance()
      return matchedPath
    }

    parser.expect(',')
    parser.skipWhitespace()
    onAdvance()
    entryIndex += 1
  }
}

function streamObjectPropertyMatches(
  parser: JsonTextParser,
  propertyName: string,
  tokens: PathToken[],
  tokenIndex: number,
  onAdvance: () => void,
  onMatch: (value: JsonValue) => void,
): boolean {
  parser.skipWhitespace()

  if (parser.peek() !== '{') {
    parser.skipValue()
    onAdvance()
    return false
  }

  parser.expect('{')
  parser.skipWhitespace()
  onAdvance()

  if (parser.consumeIf('}')) {
    onAdvance()
    return false
  }

  const isWildcardProperty = propertyName === '*'
  let matchedPath = false

  while (true) {
    const key = parser.parseString()

    parser.skipWhitespace()
    parser.expect(':')
    parser.skipWhitespace()
    onAdvance()

    if (isWildcardProperty) {
      if (tokenIndex >= tokens.length) {
        const value = parser.parseValue()

        onAdvance()
        onMatch(createObjectMapEntryRootNode(key, value))
        matchedPath = true
      } else {
        matchedPath =
          streamJsonPathMatches(
            parser,
            tokens,
            tokenIndex,
            onAdvance,
            onMatch,
          ) || matchedPath
      }
    } else if (key === propertyName) {
      matchedPath =
        streamJsonPathMatches(parser, tokens, tokenIndex, onAdvance, onMatch) ||
        matchedPath
    } else {
      parser.skipValue()
      onAdvance()
    }

    parser.skipWhitespace()

    if (parser.consumeIf('}')) {
      onAdvance()
      return matchedPath
    }

    parser.expect(',')
    parser.skipWhitespace()
    onAdvance()
  }
}

function createObjectMapEntryRootNode(
  entryKey: string,
  value: JsonValue,
): Record<string, JsonValue> {
  if (isPlainObject(value)) {
    return {
      [objectMapEntryKeyField]: entryKey,
      ...value,
    }
  }

  return {
    [objectMapEntryKeyField]: entryKey,
    value,
  }
}

function isPlainObject(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

class JsonTextParser {
  index = 0
  private readonly text: string

  constructor(text: string) {
    this.text = text
  }

  consumeIf(character: string) {
    if (this.text[this.index] !== character) {
      return false
    }

    this.index += 1
    return true
  }

  error(message: string) {
    return new Error(
      `Invalid JSON input at character ${this.index + 1}: ${message}`,
    )
  }

  expect(character: string) {
    if (this.text[this.index] !== character) {
      throw this.error(`Expected '${character}'.`)
    }

    this.index += 1
  }

  isAtEnd() {
    return this.index >= this.text.length
  }

  parseString() {
    const rawString = this.scanStringToken()

    return JSON.parse(rawString) as string
  }

  parseValue(): JsonValue {
    this.skipWhitespace()

    const character = this.peek()

    if (character === '"') {
      return this.parseString()
    }

    if (character === '{') {
      return this.parseObject()
    }

    if (character === '[') {
      return this.parseArray()
    }

    if (character === 't') {
      this.expectLiteral('true')
      return true
    }

    if (character === 'f') {
      this.expectLiteral('false')
      return false
    }

    if (character === 'n') {
      this.expectLiteral('null')
      return null
    }

    return this.parseNumber()
  }

  peek() {
    return this.text[this.index]
  }

  skipValue() {
    this.skipWhitespace()

    const character = this.peek()

    if (character === '"') {
      this.scanStringToken()
      return
    }

    if (character === '{') {
      this.skipObject()
      return
    }

    if (character === '[') {
      this.skipArray()
      return
    }

    if (character === 't') {
      this.expectLiteral('true')
      return
    }

    if (character === 'f') {
      this.expectLiteral('false')
      return
    }

    if (character === 'n') {
      this.expectLiteral('null')
      return
    }

    void this.parseNumber()
  }

  skipWhitespace() {
    while (this.index < this.text.length && /\s/.test(this.text[this.index])) {
      this.index += 1
    }
  }

  private expectLiteral(literal: 'false' | 'null' | 'true') {
    if (!this.text.startsWith(literal, this.index)) {
      throw this.error(`Expected '${literal}'.`)
    }

    this.index += literal.length
  }

  private parseArray(): JsonValue[] {
    this.expect('[')
    this.skipWhitespace()

    if (this.consumeIf(']')) {
      return []
    }

    const values: JsonValue[] = []

    while (true) {
      values.push(this.parseValue())
      this.skipWhitespace()

      if (this.consumeIf(']')) {
        return values
      }

      this.expect(',')
      this.skipWhitespace()
    }
  }

  private parseNumber() {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
      this.text.slice(this.index),
    )

    if (!match) {
      throw this.error('Expected a JSON value.')
    }

    this.index += match[0].length

    return Number(match[0])
  }

  private parseObject() {
    this.expect('{')
    this.skipWhitespace()

    if (this.consumeIf('}')) {
      return {}
    }

    const result: Record<string, JsonValue> = {}

    while (true) {
      const key = this.parseString()

      this.skipWhitespace()
      this.expect(':')
      result[key] = this.parseValue()
      this.skipWhitespace()

      if (this.consumeIf('}')) {
        return result
      }

      this.expect(',')
      this.skipWhitespace()
    }
  }

  private scanStringToken() {
    if (this.text[this.index] !== '"') {
      throw this.error('Expected a string.')
    }

    const startIndex = this.index
    this.index += 1

    while (this.index < this.text.length) {
      const character = this.text[this.index]

      if (character === '"') {
        this.index += 1
        return this.text.slice(startIndex, this.index)
      }

      if (character === '\\') {
        this.index += 1

        if (this.index >= this.text.length) {
          throw this.error('Unterminated escape sequence.')
        }

        const escapeCharacter = this.text[this.index]

        if (escapeCharacter === 'u') {
          const unicodeDigits = this.text.slice(this.index + 1, this.index + 5)

          if (!/^[0-9a-fA-F]{4}$/.test(unicodeDigits)) {
            throw this.error('Invalid unicode escape sequence.')
          }

          this.index += 5
          continue
        }

        if (!'"\\/bfnrt'.includes(escapeCharacter)) {
          throw this.error('Invalid escape sequence.')
        }

        this.index += 1
        continue
      }

      if (character.charCodeAt(0) <= 0x1f) {
        throw this.error('Unexpected control character in string literal.')
      }

      this.index += 1
    }

    throw this.error('Unterminated string literal.')
  }

  private skipArray() {
    this.expect('[')
    this.skipWhitespace()

    if (this.consumeIf(']')) {
      return
    }

    while (true) {
      this.skipValue()
      this.skipWhitespace()

      if (this.consumeIf(']')) {
        return
      }

      this.expect(',')
      this.skipWhitespace()
    }
  }

  private skipObject() {
    this.expect('{')
    this.skipWhitespace()

    if (this.consumeIf('}')) {
      return
    }

    while (true) {
      this.scanStringToken()
      this.skipWhitespace()
      this.expect(':')
      this.skipValue()
      this.skipWhitespace()

      if (this.consumeIf('}')) {
        return
      }

      this.expect(',')
      this.skipWhitespace()
    }
  }
}
