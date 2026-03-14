import { render, screen } from '@testing-library/react'

import App from '@/App'
import { AppProviders } from '@/providers/app-providers'

describe('App', () => {
  it('renders the workbench starter', async () => {
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    expect(
      screen.getByRole('heading', {
        name: /json2csv workbench starter with the full frontend stack wired in/i,
      }),
    ).toBeInTheDocument()

    expect(screen.getByText(/saved locally with dexie/i)).toBeInTheDocument()
    expect(
      await screen.findByRole('columnheader', { name: /customer/i }),
    ).toBeInTheDocument()
  })
})
