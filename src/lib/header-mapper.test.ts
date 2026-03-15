import {
  createHeaderRule,
  headerRulesFromConfig,
  headerRulesToConfig,
} from '@/lib/header-mapper'
import type { MappingConfig } from '@/lib/mapping-engine'

describe('header mapper helpers', () => {
  it('serializes header rules into aliases and explicit whitelist order', () => {
    const config = headerRulesToConfig([
      createHeaderRule({
        enabled: true,
        header: 'Product Name',
        sourcePath: ' $.name ',
      }),
      createHeaderRule({
        enabled: false,
        header: 'Metadata JSON',
        sourcePath: '$.metadata[*]',
      }),
      createHeaderRule({
        enabled: true,
        header: 'Display Name',
        sourcePath: '$.name',
      }),
    ])

    expect(config.headerWhitelist).toEqual(['name'])
    expect(config.headerAliases).toEqual({
      metadata: 'Metadata JSON',
      name: 'Display Name',
    })
  })

  it('rebuilds saved header rules with alias references and explicit order', () => {
    const config: Pick<MappingConfig, 'headerAliases' | 'headerWhitelist'> = {
      headerAliases: {
        name: 'Product Name',
        price: 'Unit Price',
      },
      headerWhitelist: ['Unit Price', 'name'],
    }

    expect(headerRulesFromConfig(config)).toEqual([
      expect.objectContaining({
        enabled: true,
        header: 'Unit Price',
        sourcePath: 'price',
      }),
      expect.objectContaining({
        enabled: true,
        header: 'Product Name',
        sourcePath: 'name',
      }),
    ])
  })
})
