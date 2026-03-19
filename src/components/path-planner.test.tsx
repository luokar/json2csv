import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import { PathPlanner } from '@/components/path-planner'
import type { InspectedPath } from '@/lib/mapping-engine'
import {
  createPlannerRule,
  plannerFamilyModeSuggestionThreshold,
} from '@/lib/path-planner'

function createInspectedPath(path: string, kinds: InspectedPath['kinds']) {
  return {
    count: 1,
    depth: path.split('.').length,
    kinds: [...kinds],
    path,
  } satisfies InspectedPath
}

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

  it('switches to grouped families for very large suggestion sets', () => {
    const largeSuggestions: InspectedPath[] = Array.from(
      { length: plannerFamilyModeSuggestionThreshold },
      (_, index) =>
        createInspectedPath(`paths.route_${index}.get.operationId`, ['string']),
    )

    render(
      <PathPlanner
        defaultMode="parallel"
        onChange={() => undefined}
        rules={[]}
        suggestions={largeSuggestions}
      />,
    )

    expect(screen.getByText('Grouped families')).toBeInTheDocument()
    expect(
      screen.getByText(/grouped family mode is active for/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /show literal tree anyway/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /include paths\.route_0/i }),
    ).toBeNull()
  })

  it('filters grouped families by query', async () => {
    const user = userEvent.setup()
    const largeSuggestions: InspectedPath[] = [
      ...Array.from(
        { length: plannerFamilyModeSuggestionThreshold },
        (_, index) =>
          createInspectedPath(`paths.route_${index}.get.operationId`, [
            'string',
          ]),
      ),
      ...Array.from({ length: 40 }, (_, index) =>
        createInspectedPath(`components.schemas.Model_${index}.properties.id`, [
          'object',
        ]),
      ),
    ]

    render(
      <PathPlanner
        defaultMode="parallel"
        onChange={() => undefined}
        rules={[]}
        suggestions={largeSuggestions}
      />,
    )

    await user.type(
      screen.getByRole('textbox', { name: /filter families/i }),
      'components.schemas',
    )

    expect(
      screen.getByRole('button', { name: /include components\.schemas/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /include paths$/i })).toBeNull()
  })
})
