import { cleanup } from '@testing-library/react'
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

import { db } from '@/lib/db'
import { queryClient } from '@/lib/query-client'

afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
})

beforeEach(async () => {
  vi.stubGlobal('Worker', undefined)
  await db.presets.clear()
  queryClient.clear()
})
