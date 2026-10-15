import { useState } from 'react'
import { createHashRouter, Outlet, RouterProvider } from 'react-router'
import { Layout } from './components/Layout'
import { ShortcutHelp } from './components/ShortcutHelp'
import { StaleSessionDialog } from './components/StaleSessionDialog'
import { Toasts, UpdateWatcher } from './components/Toasts'
import { Watchers } from './components/Watchers'
import { FocusPage } from './features/focus/FocusPage'
import { OverviewPage } from './features/projects/OverviewPage'
import { ProjectPage } from './features/projects/ProjectPage'
import { ParkingLotPage } from './features/parking-lot/ParkingLotPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { NotFound } from './components/NotFound'
import { useShortcuts } from './hooks/useShortcuts'

function Root() {
  const [helpOpen, setHelpOpen] = useState(false)
  useShortcuts({ '?': () => setHelpOpen(true) })
  return (
    <>
      <Outlet />
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <StaleSessionDialog />
      <Watchers />
      <Toasts />
      <UpdateWatcher />
    </>
  )
}

// Hash routing keeps the app deployable to any static host without rewrite rules.
const router = createHashRouter([
  {
    element: <Root />,
    children: [
      {
        element: <Layout />,
        children: [
          { path: '/', element: <OverviewPage /> },
          { path: '/project/:id', element: <ProjectPage /> },
          { path: '/parking-lot', element: <ParkingLotPage /> },
          { path: '/settings', element: <SettingsPage /> },
          { path: '*', element: <NotFound /> },
        ],
      },
      { path: '/focus/:projectId', element: <FocusPage /> },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
