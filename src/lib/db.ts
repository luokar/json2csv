import Dexie, { type EntityTable } from 'dexie'

import type { PreviewField } from '@/lib/sample-data'

export const delimiterOptions = [
  { value: 'comma', label: 'Comma (,)' },
  { value: 'semicolon', label: 'Semicolon (;)' },
  { value: 'tab', label: 'Tab' },
] as const

export type Delimiter = (typeof delimiterOptions)[number]['value']

export interface SavedPreset {
  id?: number
  name: string
  delimiter: Delimiter
  fields: PreviewField[]
  createdAt: string
}

class Json2CsvDatabase extends Dexie {
  presets!: EntityTable<SavedPreset, 'id'>

  constructor() {
    super('json2csv-workbench')

    this.version(1).stores({
      presets: '++id, name, createdAt',
    })
  }
}

export const db = new Json2CsvDatabase()

export function describeDelimiter(delimiter: Delimiter) {
  return (
    delimiterOptions.find((option) => option.value === delimiter)?.label ??
    delimiter
  )
}

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
