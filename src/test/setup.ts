import { cleanup } from '@testing-library/react'
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'

import { db } from '@/lib/db'
import { queryClient } from '@/lib/query-client'

afterEach(() => {
  cleanup()
})

beforeEach(async () => {
  await db.presets.clear()
  queryClient.clear()
})
