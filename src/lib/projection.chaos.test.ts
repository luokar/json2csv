import { createGenerator, type JsonSchema } from 'json-schema-faker'
import {
  createMappingConfig,
  flattenModes,
  type JsonValue,
  selectRootNodes,
} from '@/lib/mapping-engine'
import {
  computeProjectionPayload,
  type ProjectionPayload,
  projectionFlatRowPreviewLimit,
  projectionRelationalRowPreviewLimit,
} from '@/lib/projection'

interface ChaosRandom {
  bool: () => boolean
  int: (min: number, max: number) => number
  pick: <T>(values: readonly T[]) => T
}

interface ChaosScenario {
  expectedDiscoveredPaths: string[]
  expectedTableNames: string[]
  name: string
  rootPath: string
  schema: JsonSchema
}

interface ChaosScenarioFamily {
  build: (random: ChaosRandom) => ChaosScenario
  name: string
}

const chaosIterationsPerCase = 2
const chaosRunSeed = resolveChaosRunSeed(readChaosSeedFromEnv())

const chaosScenarioFamilies: ChaosScenarioFamily[] = [
  {
    build: buildFlatRecordScenario,
    name: 'flat records',
  },
  {
    build: buildGroupedEventScenario,
    name: 'grouped events',
  },
  {
    build: buildCatalogMapScenario,
    name: 'catalog map',
  },
  {
    build: buildTelemetryScenario,
    name: 'telemetry entries',
  },
]

const chaosCases = chaosScenarioFamilies.flatMap((family, familyIndex) =>
  flattenModes.map((flattenMode, modeIndex) => ({
    family,
    flattenMode,
    seedBase: chaosRunSeed + familyIndex * 1_000 + modeIndex * 100,
    title: `${family.name} / ${flattenMode}`,
  })),
)

describe(`projection chaos coverage (seed ${chaosRunSeed})`, () => {
  it.each(
    chaosCases,
  )('projects generated $title fixtures without structural regressions', async ({
    family,
    flattenMode,
    seedBase,
  }) => {
    for (
      let iteration = 0;
      iteration < chaosIterationsPerCase;
      iteration += 1
    ) {
      const structureSeed = seedBase + iteration * 17
      const scenario = family.build(createChaosRandom(structureSeed))
      const input = await generateScenarioInput(scenario.schema, structureSeed)
      const payload = computeProjectionPayload({
        config: createMappingConfig({
          flattenMode,
          rootPath: scenario.rootPath,
        }),
        customJson: JSON.stringify(input),
        rootPath: scenario.rootPath,
        sampleJson: input,
        sourceMode: 'custom',
      })

      try {
        assertProjectionInvariants(input, scenario, payload)
      } catch (error) {
        throw buildChaosFailureError({
          error,
          flattenMode,
          scenario,
          structureSeed,
        })
      }
    }
  })
})

async function generateScenarioInput(schema: JsonSchema, seed: number) {
  const generator = createGenerator({
    alwaysFakeOptionals: true,
    fillProperties: true,
    fixedProbabilities: true,
    maxDefaultItems: 3,
    maxDepth: 12,
    maxItems: 3,
    maxLength: 16,
    minItems: 1,
    minLength: 1,
    seed,
  })

  return toJsonValue(await generator.generate(schema))
}

function assertProjectionInvariants(
  input: JsonValue,
  scenario: ChaosScenario,
  payload: ProjectionPayload,
) {
  const roots = selectRootNodes(input, scenario.rootPath)
  const discoveredPaths = payload.discoveredPaths.map((entry) => entry.path)

  expect(roots.length).toBeGreaterThan(0)
  expect(payload.parseError).toBeNull()
  expect(payload.conversionResult).not.toBeNull()
  expect(payload.relationalSplitResult).not.toBeNull()
  expect(discoveredPaths).toEqual(
    expect.arrayContaining(scenario.expectedDiscoveredPaths),
  )

  if (!payload.conversionResult || !payload.relationalSplitResult) {
    throw new Error('Expected flat and relational projection results.')
  }

  const conversionResult = payload.conversionResult
  const relationalResult = payload.relationalSplitResult
  const rootTable = relationalResult.tables.find(
    (table) => table.tableName === 'root',
  )

  expect(rootTable).toBeDefined()
  expect(rootTable?.rowCount).toBe(roots.length)
  expect(conversionResult.rowCount).toBeGreaterThanOrEqual(roots.length)
  expect(conversionResult.records.length).toBeLessThanOrEqual(
    projectionFlatRowPreviewLimit,
  )
  expect(conversionResult.records.length).toBeLessThanOrEqual(
    conversionResult.rowCount,
  )
  expect(new Set(conversionResult.headers).size).toBe(
    conversionResult.headers.length,
  )
  expect(
    conversionResult.schema.columns.map((column) => column.header),
  ).toEqual(conversionResult.headers)

  const flatHeaderSet = new Set(conversionResult.headers)

  for (const record of conversionResult.records) {
    expect(
      Object.keys(record).every((header) => flatHeaderSet.has(header)),
    ).toBe(true)
  }

  expect(relationalResult.tables.map((table) => table.tableName)).toEqual(
    expect.arrayContaining(['root', ...scenario.expectedTableNames]),
  )

  const tablesByName = new Map(
    relationalResult.tables.map((table) => [table.tableName, table]),
  )

  for (const table of relationalResult.tables) {
    expect(new Set(table.headers).size).toBe(table.headers.length)
    expect(table.records.length).toBeLessThanOrEqual(
      projectionRelationalRowPreviewLimit,
    )
    expect(table.records.length).toBeLessThanOrEqual(table.rowCount)
    expect(table.headers).toContain(table.idColumn)

    if (table.parentIdColumn) {
      expect(table.headers).toContain(table.parentIdColumn)
    }

    const headerSet = new Set(table.headers)

    for (const record of table.records) {
      expect(Object.keys(record).every((header) => headerSet.has(header))).toBe(
        true,
      )
    }
  }

  for (const relationship of relationalResult.relationships) {
    const childTable = tablesByName.get(relationship.childTable)
    const parentTable = tablesByName.get(relationship.parentTable)

    expect(childTable).toBeDefined()
    expect(parentTable).toBeDefined()
    expect(childTable?.headers).toContain(relationship.foreignKeyColumn)
    expect(parentTable?.headers).toContain(relationship.parentIdColumn)
  }
}

function buildFlatRecordScenario(random: ChaosRandom): ChaosScenario {
  const collectionKey = random.pick(['records', 'entries', 'rows'])
  const nestedKey = random.pick(['profile', 'details', 'contact'])
  const arrayKey = random.pick(['tags', 'labels', 'signals'])
  const statusKey = random.pick(['status', 'state'])
  const historyKey = random.pick(['history', 'changes', 'events'])
  const includeHistory = random.bool()
  const recordProperties: Record<string, JsonSchema> = {
    active: {
      type: 'boolean',
    },
    id: stringSchema(4, 10),
    [arrayKey]: arraySchema(stringSchema(2, 8), 1, 3),
    [nestedKey]: objectSchema(
      {
        createdAt: dateTimeSchema(),
        email: emailSchema(),
        region: enumSchema(['apac', 'emea', 'amer']),
      },
      ['createdAt', 'email'],
    ),
    [statusKey]: enumSchema(['draft', 'live', 'archived']),
    score: numberSchema(0, 100),
  }
  const required = ['active', 'id', arrayKey, nestedKey, statusKey, 'score']

  if (includeHistory) {
    recordProperties[historyKey] = arraySchema(
      objectSchema(
        {
          actor: stringSchema(3, 10),
          at: dateTimeSchema(),
          note: stringSchema(3, 20),
        },
        ['actor', 'at'],
      ),
      1,
      2,
    )
    required.push(historyKey)
  }

  return {
    expectedDiscoveredPaths: ['id', `${nestedKey}.email`, arrayKey],
    expectedTableNames: [arrayKey],
    name: `flat ${collectionKey}`,
    rootPath: `$.${collectionKey}[*]`,
    schema: objectSchema(
      {
        [collectionKey]: arraySchema(
          objectSchema(recordProperties, required),
          1,
          4,
        ),
      },
      [collectionKey],
    ),
  }
}

function buildGroupedEventScenario(random: ChaosRandom): ChaosScenario {
  const groupsKey = random.pick(['groups', 'clusters', 'batches'])
  const recordsKey = random.pick(['records', 'events', 'items'])
  const lineItemsKey = random.pick(['lineItems', 'details', 'segments'])
  const discountsKey = random.pick(['discounts', 'adjustments', 'credits'])
  const idKey = random.pick(['eventId', 'recordId', 'traceId'])
  const contextKey = random.pick(['context', 'attributes', 'detail'])
  const includeContext = random.bool()
  const lineItemProperties: Record<string, JsonSchema> = {
    [discountsKey]: arraySchema(
      objectSchema(
        {
          amount: numberSchema(0, 0.5),
          code: stringSchema(3, 6),
        },
        ['amount', 'code'],
      ),
      1,
      2,
    ),
    quantity: integerSchema(1, 5),
    sku: stringSchema(4, 8),
  }
  const lineItemRequired = [discountsKey, 'quantity', 'sku']

  if (includeContext) {
    lineItemProperties[contextKey] = objectSchema(
      {
        source: enumSchema(['api', 'manual', 'batch']),
        warehouse: stringSchema(3, 8),
      },
      ['source'],
    )
    lineItemRequired.push(contextKey)
  }

  return {
    expectedDiscoveredPaths: [
      idKey,
      `${lineItemsKey}.sku`,
      `${lineItemsKey}.${discountsKey}.amount`,
    ],
    expectedTableNames: [lineItemsKey, `${lineItemsKey}_${discountsKey}`],
    name: `${groupsKey} -> ${recordsKey}`,
    rootPath: `$.${groupsKey}[*].${recordsKey}[*]`,
    schema: objectSchema(
      {
        [groupsKey]: arraySchema(
          objectSchema(
            {
              groupId: stringSchema(3, 8),
              [recordsKey]: arraySchema(
                objectSchema(
                  {
                    [idKey]: stringSchema(5, 10),
                    [lineItemsKey]: arraySchema(
                      objectSchema(lineItemProperties, lineItemRequired),
                      1,
                      2,
                    ),
                    severity: enumSchema(['low', 'medium', 'high']),
                  },
                  [idKey, lineItemsKey],
                ),
                1,
                2,
              ),
              region: enumSchema(['north', 'south', 'east', 'west']),
            },
            ['groupId', recordsKey],
          ),
          1,
          2,
        ),
      },
      [groupsKey],
    ),
  }
}

function buildCatalogMapScenario(random: ChaosRandom): ChaosScenario {
  const mapKey = random.pick(['catalog', 'inventory', 'lookup'])
  const attrsKey = random.pick(['attributes', 'specs', 'traits'])
  const stockKey = random.pick(['stock', 'levels', 'counts'])
  const locationsKey = random.pick(['locations', 'warehouses', 'sites'])
  const includeLocations = random.bool()
  const valueProperties: Record<string, JsonSchema> = {
    [attrsKey]: objectSchema(
      {
        color: enumSchema(['red', 'blue', 'green']),
        fragile: {
          type: 'boolean',
        },
        size: enumSchema(['s', 'm', 'l', 'xl']),
      },
      ['color', 'size'],
    ),
    [stockKey]: arraySchema(integerSchema(0, 200), 1, 3),
    id: stringSchema(4, 8),
    price: numberSchema(0, 999),
  }
  const required = [attrsKey, stockKey, 'id', 'price']

  if (includeLocations) {
    valueProperties[locationsKey] = arraySchema(
      objectSchema(
        {
          qty: integerSchema(0, 50),
          site: stringSchema(3, 8),
        },
        ['qty', 'site'],
      ),
      1,
      2,
    )
    required.push(locationsKey)
  }

  return {
    expectedDiscoveredPaths: ['__entryKey', `${attrsKey}.color`, stockKey],
    expectedTableNames: [stockKey],
    name: `map ${mapKey}`,
    rootPath: `$.${mapKey}.*`,
    schema: objectSchema(
      {
        [mapKey]: {
          additionalProperties: objectSchema(valueProperties, required),
          maxProperties: random.int(1, 3),
          minProperties: 1,
          type: 'object',
        },
      },
      [mapKey],
    ),
  }
}

function buildTelemetryScenario(random: ChaosRandom): ChaosScenario {
  const envelopeKey = random.pick(['payload', 'batch', 'envelope'])
  const entriesKey = random.pick(['entries', 'samples', 'rows'])
  const flagsKey = random.pick(['flags', 'checks', 'toggles'])
  const metricsKey = random.pick(['metrics', 'measures', 'signals'])
  const metadataKey = random.pick(['metadata', 'audit', 'origin'])
  const idKey = random.pick(['entryId', 'sampleId', 'traceId'])
  const alertsKey = random.pick(['alerts', 'attachments', 'notes'])
  const includeAlerts = random.bool()
  const entryProperties: Record<string, JsonSchema> = {
    [flagsKey]: arraySchema(
      {
        type: 'boolean',
      },
      1,
      3,
    ),
    [idKey]: stringSchema(5, 10),
    [metadataKey]: objectSchema(
      {
        notes: stringSchema(3, 20),
        observedAt: dateTimeSchema(),
        source: enumSchema(['sensor', 'import', 'manual']),
      },
      ['observedAt', 'source'],
    ),
    [metricsKey]: arraySchema(
      objectSchema(
        {
          name: enumSchema(['latency', 'throughput', 'errorRate']),
          unit: enumSchema(['ms', 'rpm', 'pct']),
          value: {
            oneOf: [numberSchema(0, 1000), { type: 'null' }],
          },
        },
        ['name', 'value'],
      ),
      1,
      2,
    ),
    status: enumSchema(['queued', 'ready', 'sent']),
  }
  const required = [flagsKey, idKey, metadataKey, metricsKey]

  if (includeAlerts) {
    entryProperties[alertsKey] = arraySchema(
      objectSchema(
        {
          code: stringSchema(3, 8),
          open: {
            type: 'boolean',
          },
        },
        ['code', 'open'],
      ),
      1,
      2,
    )
    required.push(alertsKey)
  }

  return {
    expectedDiscoveredPaths: [idKey, flagsKey, `${metricsKey}.value`],
    expectedTableNames: [flagsKey, metricsKey],
    name: `${envelopeKey} -> ${entriesKey}`,
    rootPath: `$.${envelopeKey}.${entriesKey}[*]`,
    schema: objectSchema(
      {
        [envelopeKey]: objectSchema(
          {
            [entriesKey]: arraySchema(
              objectSchema(entryProperties, required),
              1,
              3,
            ),
          },
          [entriesKey],
        ),
      },
      [envelopeKey],
    ),
  }
}

function buildChaosFailureError(options: {
  error: unknown
  flattenMode: string
  scenario: ChaosScenario
  structureSeed: number
}) {
  const detail =
    options.error instanceof Error
      ? options.error.message
      : String(options.error)

  return new Error(
    `Chaos scenario failure for ${options.scenario.name} in ${options.flattenMode} mode (run seed ${chaosRunSeed}, structure seed ${options.structureSeed}, root path ${options.scenario.rootPath}): ${detail}`,
  )
}

function resolveChaosRunSeed(value: string | undefined) {
  if (!value) {
    return Date.now()
  }

  const parsed = Number.parseInt(value, 10)

  return Number.isFinite(parsed) ? parsed : Date.now()
}

function readChaosSeedFromEnv() {
  const processLike = globalThis as typeof globalThis & {
    process?: {
      env?: Record<string, string | undefined>
    }
  }

  return processLike.process?.env?.CHAOS_SEED
}

function createChaosRandom(seed: number): ChaosRandom {
  let state = seed >>> 0

  const next = () => {
    state = (state + 0x6d2b79f5) | 0

    let result = Math.imul(state ^ (state >>> 15), 1 | state)

    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result)

    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296
  }

  return {
    bool: () => next() >= 0.5,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    pick: (values) => {
      const value = values[Math.floor(next() * values.length)]

      if (value === undefined) {
        throw new Error('Cannot pick from an empty list.')
      }

      return value
    },
  }
}

function arraySchema(items: JsonSchema, minItems: number, maxItems: number) {
  return {
    items,
    maxItems,
    minItems,
    type: 'array',
  } satisfies JsonSchema
}

function dateTimeSchema() {
  return {
    format: 'date-time',
    type: 'string',
  } satisfies JsonSchema
}

function emailSchema() {
  return {
    format: 'email',
    type: 'string',
  } satisfies JsonSchema
}

function enumSchema(values: string[]) {
  return {
    enum: values,
  } satisfies JsonSchema
}

function integerSchema(minimum: number, maximum: number) {
  return {
    maximum,
    minimum,
    type: 'integer',
  } satisfies JsonSchema
}

function numberSchema(minimum: number, maximum: number) {
  return {
    maximum,
    minimum,
    type: 'number',
  } satisfies JsonSchema
}

function objectSchema(
  properties: Record<string, JsonSchema>,
  required: string[],
) {
  return {
    additionalProperties: false,
    properties,
    required,
    type: 'object',
  } satisfies JsonSchema
}

function stringSchema(minLength: number, maxLength: number) {
  return {
    maxLength,
    minLength,
    type: 'string',
  } satisfies JsonSchema
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}
