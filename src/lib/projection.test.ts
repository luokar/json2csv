import { createMappingConfig } from '@/lib/mapping-engine'
import { mappingSamples } from '@/lib/mapping-samples'
import { computeProjectionPayload } from '@/lib/projection'

describe('projection pipeline', () => {
  const donutSample = mappingSamples.find((sample) => sample.id === 'donuts')

  if (!donutSample) {
    throw new Error('Missing donut sample')
  }

  it('projects sample input without parsing custom JSON', () => {
    const result = computeProjectionPayload({
      config: createMappingConfig({
        flattenMode: 'parallel',
        rootPath: '$.items.item[*]',
      }),
      customJson: '',
      rootPath: '$.items.item[*]',
      sampleJson: donutSample.json,
      sourceMode: 'sample',
    })

    expect(result.parseError).toBeNull()
    expect(result.conversionResult?.rowCount).toBe(10)
    expect(result.discoveredPaths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'topping' }),
        expect.objectContaining({ path: 'batters.batter.type' }),
      ]),
    )
  })

  it('returns a parse error and no conversion for invalid custom JSON', () => {
    const result = computeProjectionPayload({
      config: createMappingConfig({
        flattenMode: 'stringify',
        rootPath: '$.records[*]',
      }),
      customJson: '{"records": [',
      rootPath: '$.records[*]',
      sampleJson: donutSample.json,
      sourceMode: 'custom',
    })

    expect(result.parseError).toMatch(/unexpected end/i)
    expect(result.conversionResult).toBeNull()
    expect(result.discoveredPaths).toEqual([])
  })
})
