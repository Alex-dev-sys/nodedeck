import { createElement, lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '@/layouts/AppShell'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { RouteErrorPage } from '@/pages/RouteErrorPage'
import { LoginPage } from '@/pages/LoginPage'

const dashboard = lazy(async () => ({ default: (await import('@/pages/DashboardPage')).DashboardPage }))
const infrastructure = lazy(async () => ({ default: (await import('@/pages/InfrastructurePage')).InfrastructurePage }))
const monitoring = lazy(async () => ({ default: (await import('@/pages/MonitoringPage')).MonitoringPage }))
const logs = lazy(async () => ({ default: (await import('@/pages/LogsPage')).LogsPage }))
const alerts = lazy(async () => ({ default: (await import('@/pages/AlertsPage')).AlertsPage }))
const managedService = lazy(async () => ({ default: (await import('@/pages/ServicePage')).ManagedServicePage }))
const settings = lazy(async () => ({ default: (await import('@/pages/SettingsPage')).SettingsPage }))
const agents = lazy(async () => ({ default: (await import('@/pages/AgentsPage')).AgentsPage }))
const commands = lazy(async () => ({ default: (await import('@/pages/CommandsPage')).CommandsPage }))
const billing = lazy(async () => ({ default: (await import('@/pages/BillingPage')).BillingPage }))

function page(element: ReactNode) {
  return <Suspense fallback={<PageSkeleton />}>{element}</Suspense>
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteErrorPage /> },
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: page(createElement(dashboard)) },
      { path: 'infrastructure', element: page(createElement(infrastructure)) },
      { path: 'services/:serviceId', element: page(createElement(managedService)) },
      { path: 'monitoring', element: page(createElement(monitoring)) },
      { path: 'logs', element: page(createElement(logs)) },
      { path: 'alerts', element: page(createElement(alerts)) },
      { path: 'settings', element: page(createElement(settings)) },
      { path: 'agents', element: page(createElement(agents)) },
      { path: 'commands', element: page(createElement(commands)) },
      { path: 'billing', element: page(createElement(billing)) },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
