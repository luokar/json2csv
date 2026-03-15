import { detectSmartConfigSuggestion } from '@/lib/smart-config'

describe('smart config detection', () => {
  it('detects keyed object maps that should become rows', () => {
    const suggestion = detectSmartConfigSuggestion({
      data: {
        '189512': {
          anomaly: -1.2,
          value: 51.4,
        },
        '189612': {
          anomaly: -0.9,
          value: 52.1,
        },
        '189712': {
          anomaly: -0.4,
          value: 52.6,
        },
        '189812': {
          anomaly: -0.2,
          value: 52.8,
        },
        '189912': {
          anomaly: 0.1,
          value: 53.1,
        },
      },
      description: {
        title: 'NOAA style sample',
      },
    })

    expect(suggestion).toEqual(
      expect.objectContaining({
        entryCount: 5,
        keyAlias: 'period',
        keySourcePath: '__entryKey',
        previewHeaders: ['period', 'anomaly', 'value'],
        recordMapPath: '$.data',
        rootPath: '$.data.*',
      }),
    )
    expect(suggestion?.estimatedSiblingColumnsAvoided).toBeGreaterThan(0)
  })

  it('ignores ordinary nested objects that are not record maps', () => {
    expect(
      detectSmartConfigSuggestion({
        metadata: {
          createdAt: '2026-03-15',
          owner: 'ops',
          source: 'manual',
        },
        summary: {
          active: true,
          count: 12,
        },
      }),
    ).toBeNull()
  })
})
