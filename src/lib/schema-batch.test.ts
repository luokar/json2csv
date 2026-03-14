import { convertJsonBatchToCsvTables } from '@/lib/schema-batch'

describe('schema batch workflow', () => {
  it('appends new headers in lax mode and aggregates mixed-type reports', () => {
    const result = convertJsonBatchToCsvTables(
      [
        {
          records: [{ id: 'a1', price: 10 }],
        },
        {
          records: [{ id: 'a2', price: 'N/A', notes: { source: 'manual' } }],
        },
      ],
      {
        rootPath: '$.records[*]',
        flattenMode: 'stringify',
        onTypeMismatch: 'coerce',
      },
      {
        schemaMode: 'lax',
      },
    )

    expect(result.initialSnapshot.headers).toEqual(['id', 'price'])
    expect(result.finalSnapshot.headers).toEqual([
      'id',
      'price',
      'notes.source',
    ])
    expect(result.snapshotHistory).toEqual([
      expect.objectContaining({
        inputIndex: 1,
        newHeaders: ['notes.source'],
      }),
    ])
    expect(result.files.map((file) => file.status)).toEqual([
      'success',
      'success',
    ])
    expect(result.files[1].result?.headers).toEqual([
      'id',
      'price',
      'notes.source',
    ])

    const priceReport = result.typeReports.find(
      (report) => report.sourcePath === 'price',
    )

    expect(priceReport).toMatchObject({
      coercedTo: 'string',
      exportHeaders: ['price'],
      observedCount: 2,
      sourcePath: 'price',
    })
    expect(priceReport?.typeBreakdown).toEqual([
      expect.objectContaining({
        count: 1,
        kind: 'string',
        percentage: 50,
      }),
      expect.objectContaining({
        count: 1,
        kind: 'number',
        percentage: 50,
      }),
    ])
  })

  it('fails later files in strict mode when new headers appear', () => {
    const result = convertJsonBatchToCsvTables(
      [
        {
          records: [{ id: 'a1', price: 10 }],
        },
        {
          records: [{ id: 'a2', price: 'N/A', notes: { source: 'manual' } }],
        },
      ],
      {
        rootPath: '$.records[*]',
        flattenMode: 'stringify',
      },
      {
        schemaMode: 'strict',
      },
    )

    expect(result.files.map((file) => file.status)).toEqual([
      'success',
      'failed',
    ])
    expect(result.driftIssues).toEqual([
      {
        inputIndex: 1,
        newHeaders: ['notes.source'],
        snapshotVersion: result.initialSnapshot.version,
      },
    ])
    expect(result.finalSnapshot.headers).toEqual(['id', 'price'])
    expect(result.files[1].result).toBeUndefined()
  })

  it('reserves prior header names so collision handling stays stable across files', () => {
    const result = convertJsonBatchToCsvTables(
      [
        {
          rows: [{ user_id: 1 }],
        },
        {
          rows: [{ user: { id: 2 } }],
        },
      ],
      {
        rootPath: '$.rows[*]',
        flattenMode: 'stringify',
        pathSeparator: '_',
        strictNaming: true,
      },
      {
        schemaMode: 'lax',
      },
    )

    expect(result.finalSnapshot.headers).toEqual(['user_id', 'user_id_1'])
    expect(result.files[1].result?.headers).toEqual(['user_id', 'user_id_1'])
    expect(result.files[1].result?.records[0]).toEqual({
      user_id: '',
      user_id_1: '2',
    })
  })
})
