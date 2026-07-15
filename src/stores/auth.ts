import { create } from 'zustand'
import type { Role } from '@/types'

export interface SessionUser {
  id: string
  email: string
  role: Role
  organizationId: string
}

interface AuthState {
  accessToken: string | null
  user: SessionUser | null
  isRestoring: boolean
  setSession: (accessToken: string, user: SessionUser) => void
  clearSession: () => void
  finishRestoring: () => void
}

export const useAuth = create<AuthState>()((set) => ({
  // Access credentials stay only in memory. SessionBootstrap refreshes them from the HttpOnly cookie on load.
  accessToken: null,
  user: null,
  isRestoring: true,
  setSession: (accessToken, user) => set({ accessToken, user }),
  clearSession: () => set({ accessToken: null, user: null }),
  finishRestoring: () => set({ isRestoring: false }),
}))
