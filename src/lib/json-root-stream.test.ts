import {
  resolveStreamableJsonPath,
  streamJsonPath,
} from '@/lib/json-root-stream'

describe('json root streaming helpers', () => {
  it('detects streamable selectors for the current JSONPath subset', () => {
    expect(resolveStreamableJsonPath('$.groups[*].records[*]')).toEqual({
      rootPath: '$.groups[*].records[*]',
      tokens: [
        { type: 'property', value: 'groups' },
        { type: 'wildcard' },
        { type: 'property', value: 'records' },
        { type: 'wildcard' },
      ],
    })
    expect(resolveStreamableJsonPath('$.groups[1].records[0]')).toEqual({
      rootPath: '$.groups[1].records[0]',
      tokens: [
        { type: 'property', value: 'groups' },
        { type: 'index', value: 1 },
        { type: 'property', value: 'records' },
        { type: 'index', value: 0 },
      ],
    })
    expect(resolveStreamableJsonPath('$')).toEqual({
      rootPath: '$',
      tokens: [],
    })
    expect(resolveStreamableJsonPath('records[*]')).toEqual({
      rootPath: 'records[*]',
      tokens: [{ type: 'property', value: 'records' }, { type: 'wildcard' }],
    })
    expect(resolveStreamableJsonPath('   ')).toBeNull()
  })

  it('streams nested wildcard selector matches and reports parse progress', () => {
    const text = `{
  "groups": [
    {
      "name": "A",
      "records": [
        {
          "id": "1",
          "email": "one@example.com"
        },
        {
          "id": "2",
          "email": "two@example.com"
        }
      ]
    },
    {
      "name": "B",
      "records": [
        {
          "id": "3",
          "email": "three@example.com",
          "active": true
        }
      ]
    }
  ],
  "meta": {
    "ignored": [1, 2, 3]
  }
}`
    const roots: unknown[] = []
    const progressEvents: Array<{
      processedCharacters: number
      totalCharacters: number
      yieldedRoots: number
    }> = []

    const result = streamJsonPath(text, '$.groups[*].records[*]', {
      onProgress: (progress) => {
        progressEvents.push(progress)
      },
      onRoot: (value) => {
        roots.push(value)
      },
    })

    expect(result).toEqual({
      matchedPath: true,
      rootCount: 3,
    })
    expect(roots).toEqual([
      {
        email: 'one@example.com',
        id: '1',
      },
      {
        email: 'two@example.com',
        id: '2',
      },
      {
        active: true,
        email: 'three@example.com',
        id: '3',
      },
    ])
    expect(progressEvents[0]).toEqual(
      expect.objectContaining({
        processedCharacters: 0,
        totalCharacters: text.length,
        yieldedRoots: 0,
      }),
    )
    expect(progressEvents.at(-1)).toEqual(
      expect.objectContaining({
        processedCharacters: text.length,
        totalCharacters: text.length,
        yieldedRoots: 3,
      }),
    )
  })

  it('streams indexed selector matches inside nested arrays', () => {
    const text = `[
  {
    "records": [{ "id": "1" }, { "id": "2" }]
  },
  {
    "records": [{ "id": "3" }, { "id": "4" }]
  }
]`
    const roots: unknown[] = []

    const result = streamJsonPath(text, '$[1].records[0]', {
      onRoot: (value) => {
        roots.push(value)
      },
    })

    expect(result).toEqual({
      matchedPath: true,
      rootCount: 1,
    })
    expect(roots).toEqual([{ id: '3' }])
  })

  it('throws a parse error for invalid JSON input', () => {
    expect(() =>
      streamJsonPath('{"records": [{"id": "1"}, ]}', '$.records[*]', {
        onRoot: () => undefined,
      }),
    ).toThrow(/invalid json input at character/i)
  })
})
