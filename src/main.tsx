import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { queryClient } from '@/app/queryClient'
import { SessionBootstrap } from '@/app/SessionBootstrap'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionBootstrap />
    </QueryClientProvider>
  </StrictMode>,
)
