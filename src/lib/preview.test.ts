import { createRowPreview, createTextPreview } from '@/lib/preview'

describe('preview helpers', () => {
  it('truncates oversized text previews with metadata', () => {
    const result = createTextPreview('abcdefghij', 6)

    expect(result).toEqual({
      omittedCharacters: 4,
      omittedCharactersKnown: true,
      text: 'abcdef\n\n[Preview truncated]',
      truncated: true,
    })
  })

  it('limits row previews without mutating small datasets', () => {
    const result = createRowPreview(['a', 'b', 'c', 'd'], 2)

    expect(result).toEqual({
      omittedRows: 2,
      rows: ['a', 'b'],
      truncated: true,
    })
    expect(createRowPreview(['a'], 2)).toEqual({
      omittedRows: 0,
      rows: ['a'],
      truncated: false,
    })
  })
})
