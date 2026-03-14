import { inspectMappingPaths, type MappingConfig } from '@/lib/mapping-engine'
import { mappingSamples } from '@/lib/mapping-samples'
import {
  createPlannerRule,
  plannerRulesFromConfig,
  plannerRulesToConfig,
} from '@/lib/path-planner'

describe('path planner helpers', () => {
  it('serializes planner rules into mapping config overrides', () => {
    const config = plannerRulesToConfig([
      createPlannerRule({
        action: 'mode',
        mode: 'cross_product',
        path: ' topping ',
      }),
      createPlannerRule({
        action: 'drop',
        path: ' user.password ',
      }),
      createPlannerRule({
        action: 'stringify',
        path: '$.metadata[*]',
      }),
      createPlannerRule({
        action: 'stringify',
        path: '$.topping[*]',
      }),
    ])

    expect(config.pathModes).toEqual({})
    expect(config.stringifyPaths).toEqual(['metadata', 'topping'])
    expect(config.dropPaths).toEqual(['user.password'])
  })

  it('rebuilds planner rows from saved config with drop precedence', () => {
    const config: Pick<
      MappingConfig,
      'dropPaths' | 'pathModes' | 'stringifyPaths'
    > = {
      dropPaths: ['topping'],
      pathModes: {
        topping: 'cross_product',
      },
      stringifyPaths: ['notes'],
    }

    expect(plannerRulesFromConfig(config)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'stringify',
          path: 'notes',
        }),
        expect.objectContaining({
          action: 'drop',
          path: 'topping',
        }),
      ]),
    )
  })

  it('inspects relative paths under the selected root', () => {
    const donutSample = mappingSamples.find((sample) => sample.id === 'donuts')

    if (!donutSample) {
      throw new Error('Missing donut sample')
    }

    const inspectedPaths = inspectMappingPaths(
      donutSample.json,
      '$.items.item[*]',
    )

    expect(inspectedPaths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          count: 2,
          depth: 1,
          kinds: expect.arrayContaining(['array', 'object']),
          path: 'topping',
        }),
        expect.objectContaining({
          count: 10,
          depth: 2,
          kinds: ['string'],
          path: 'topping.type',
        }),
      ]),
    )

    expect(
      inspectedPaths.some((entry) => entry.path.startsWith('items.')),
    ).toBe(false)
  })
})
