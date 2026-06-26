import React from 'react'
import { render } from 'ink'
import { App } from './App'

export async function start_ui() {
  const { waitUntilExit } = render(<App />)
  await waitUntilExit()
}
