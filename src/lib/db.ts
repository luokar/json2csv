import Dexie, { type EntityTable } from 'dexie'

import type { MappingConfig } from '@/lib/mapping-engine'

export type SourceMode = 'sample' | 'custom'

export interface SavedPreset {
  id?: number
  name: string
  sourceMode?: SourceMode
  sampleId: string
  customJson?: string
  config: MappingConfig
  createdAt: string
}

class Json2CsvDatabase extends Dexie {
  presets!: EntityTable<SavedPreset, 'id'>

  constructor() {
    super('json2csv-workbench')

    this.version(3).stores({
      presets: '++id, name, sourceMode, sampleId, createdAt',
    })
  }
}

export const db = new Json2CsvDatabase()

export function listPresets() {
  return db.presets.orderBy('createdAt').reverse().toArray()
}

export async function createPreset(
  input: Omit<SavedPreset, 'id' | 'createdAt'>,
) {
  const record: SavedPreset = {
    ...input,
    createdAt: new Date().toISOString(),
  }

  const id = await db.presets.add(record)

  return {
    ...record,
    id,
  }
}
