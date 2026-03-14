export const availableFields = [
  'id',
  'customer',
  'plan',
  'country',
  'amount',
  'status',
  'createdAt',
] as const

export type PreviewField = (typeof availableFields)[number]

export interface PreviewRecord {
  id: string
  customer: string
  plan: string
  country: string
  amount: number
  status: 'mapped' | 'review' | 'queued'
  createdAt: string
}

export const defaultFields: PreviewField[] = [
  'id',
  'customer',
  'plan',
  'amount',
]

const availableFieldLookup = new Set<string>(availableFields)

export const previewRows: PreviewRecord[] = [
  {
    id: 'inv_001',
    customer: 'Atlas Retail',
    plan: 'Growth',
    country: 'HK',
    amount: 12800,
    status: 'mapped',
    createdAt: '2026-03-02',
  },
  {
    id: 'inv_002',
    customer: 'Northwind Foods',
    plan: 'Enterprise',
    country: 'SG',
    amount: 21200,
    status: 'review',
    createdAt: '2026-03-05',
  },
  {
    id: 'inv_003',
    customer: 'Studio Meraki',
    plan: 'Starter',
    country: 'JP',
    amount: 4800,
    status: 'mapped',
    createdAt: '2026-03-07',
  },
  {
    id: 'inv_004',
    customer: 'Delta Health',
    plan: 'Growth',
    country: 'AU',
    amount: 9600,
    status: 'queued',
    createdAt: '2026-03-09',
  },
  {
    id: 'inv_005',
    customer: 'Oakline Travel',
    plan: 'Enterprise',
    country: 'US',
    amount: 18300,
    status: 'review',
    createdAt: '2026-03-11',
  },
]

export function parseFields(input: string) {
  const seen = new Set<string>()

  return input
    .split(',')
    .map((field) => field.trim())
    .filter((field): field is PreviewField => {
      if (!field || !availableFieldLookup.has(field) || seen.has(field)) {
        return false
      }

      seen.add(field)
      return true
    })
}

export function toFieldLabel(field: string) {
  return field
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (value) => value.toUpperCase())
}
