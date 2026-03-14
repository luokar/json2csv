import {
  formatJsonInput,
  parseJsonInput,
  stringifyJsonInput,
} from '@/lib/json-input'

describe('json input helpers', () => {
  it('parses valid JSON text', () => {
    const result = parseJsonInput('{"records":[{"id":"1"}]}')

    expect(result.error).toBeUndefined()
    expect(result.value).toEqual({
      records: [{ id: '1' }],
    })
  })

  it('supports scalar JSON values when formatting', () => {
    const formattedNull = formatJsonInput('null')
    const formattedFalse = formatJsonInput('false')

    expect(formattedNull.error).toBeUndefined()
    expect(formattedNull.formattedText).toBe('null')
    expect(formattedNull.value).toBeNull()

    expect(formattedFalse.error).toBeUndefined()
    expect(formattedFalse.formattedText).toBe('false')
    expect(formattedFalse.value).toBe(false)
  })

  it('stringifies values for the editor and reports invalid input', () => {
    expect(stringifyJsonInput({ ok: true })).toBe(`{
  "ok": true
}`)

    const invalid = parseJsonInput('{oops')

    expect(invalid.value).toBeUndefined()
    expect(invalid.error).toMatch(/expected property name|unexpected token/i)
  })
})
