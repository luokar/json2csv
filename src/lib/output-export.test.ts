import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { createMappingConfig } from '@/lib/mapping-engine'
import {
  buildOutputExportBundle,
  createOutputExportRequest,
  outputExportMimeTypes,
} from '@/lib/output-export'

describe('output export helpers', () => {
  it('builds full flat and relational export artifacts', () => {
    const bundle = buildOutputExportBundle(
      createOutputExportRequest({
        config: createMappingConfig({ rootPath: '$.items[*]' }),
        customJson: '',
        exportName: 'Donut relational export',
        rootPath: '$.items[*]',
        sampleJson: {
          items: [
            {
              id: '0001',
              name: 'Cake',
              topping: [{ type: 'None' }, { type: 'Glazed' }],
            },
          ],
        },
        sourceMode: 'sample',
      }),
    )

    expect(bundle.flatCsv.fileName).toBe('donut-relational-export.csv')
    expect(bundle.flatCsv.mimeType).toBe(outputExportMimeTypes.csv)
    expect(strFromU8(bundle.flatCsv.bytes)).toContain('name')
    expect(bundle.relationalArchive?.fileName).toBe(
      'donut-relational-export-relational.zip',
    )
    expect(bundle.relationalArchive?.mimeType).toBe(outputExportMimeTypes.zip)
    expect(bundle.relationalTables.map((table) => table.tableName)).toEqual([
      'root',
      'topping',
    ])

    if (!bundle.relationalArchive) {
      throw new Error('Expected a relational archive artifact.')
    }

    const archiveEntries = unzipSync(bundle.relationalArchive.bytes)
    const archiveFileNames = Object.keys(archiveEntries)
      .filter((name) => !name.endsWith('/'))
      .sort()

    expect(archiveFileNames).toEqual([
      'donut-relational-export-relational/manifest.json',
      'donut-relational-export-relational/tables/README.txt',
      'donut-relational-export-relational/tables/donut-relational-export--root.csv',
      'donut-relational-export-relational/tables/donut-relational-export--topping.csv',
    ])

    expect(
      JSON.parse(
        strFromU8(
          archiveEntries['donut-relational-export-relational/manifest.json'],
        ),
      ),
    ).toMatchObject({
      exportName: 'Donut relational export',
      rootPath: '$.items[*]',
      sourceMode: 'sample',
      tables: [
        {
          fileName: 'donut-relational-export--root.csv',
          tableName: 'root',
        },
        {
          fileName: 'donut-relational-export--topping.csv',
          tableName: 'topping',
        },
      ],
    })
  })

  it('rejects invalid custom JSON before building artifacts', () => {
    expect(() =>
      buildOutputExportBundle(
        createOutputExportRequest({
          config: createMappingConfig({ rootPath: '$.items[*]' }),
          customJson: '',
          exportName: 'Broken export',
          rootPath: '$.items[*]',
          sampleJson: { items: [] },
          sourceMode: 'custom',
        }),
      ),
    ).toThrow('Paste JSON or upload a .json file.')
  })
})
