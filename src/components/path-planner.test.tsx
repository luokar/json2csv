import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import { PathPlanner } from '@/components/path-planner'
import type { InspectedPath } from '@/lib/mapping-engine'
import { createPlannerRule } from '@/lib/path-planner'

describe('PathPlanner', () => {
  const suggestions: InspectedPath[] = [
    {
      count: 2,
      depth: 1,
      kinds: ['array', 'object'],
      path: 'topping',
    },
    {
      count: 10,
      depth: 2,
      kinds: ['string'],
      path: 'topping.type',
    },
    {
      count: 1,
      depth: 1,
      kinds: ['object'],
      path: 'metadata',
    },
  ]

  it('renders a nested workflow tree with split recommendations', () => {
    render(
      <PathPlanner
        defaultMode="parallel"
        onChange={() => undefined}
        rules={[]}
        suggestions={suggestions}
      />,
    )

    expect(screen.getByText(/workflow tree/i)).toBeInTheDocument()
    expect(screen.getByText(/split candidate/i)).toBeInTheDocument()
    expect(screen.getByText(/one-to-many branch detected/i)).toBeInTheDocument()
    expect(screen.getByText('topping')).toBeInTheDocument()
    expect(screen.getByText('topping.type')).toBeInTheDocument()
  })

  it('applies and clears workflow-tree rules through branch actions', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()

    const { rerender } = render(
      <PathPlanner
        defaultMode="parallel"
        onChange={handleChange}
        rules={[]}
        suggestions={suggestions}
      />,
    )

    await user.click(screen.getByRole('button', { name: /stringify topping/i }))

    expect(handleChange).toHaveBeenCalledWith([
      expect.objectContaining({
        action: 'stringify',
        path: 'topping',
      }),
    ])

    rerender(
      <PathPlanner
        defaultMode="parallel"
        onChange={handleChange}
        rules={[
          createPlannerRule({
            action: 'drop',
            path: 'metadata',
          }),
        ]}
        suggestions={suggestions}
      />,
    )

    await user.click(screen.getByRole('button', { name: /keep metadata/i }))

    expect(handleChange).toHaveBeenCalledWith([])
  })
})
