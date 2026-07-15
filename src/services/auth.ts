import type { SessionUser } from '@/stores/auth'
import { ApiError } from './api'

interface LoginResponse {
  accessToken: string
  user: SessionUser
}

export async function refreshSession(): Promise<LoginResponse | null> {
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/auth/refresh`, { method: 'POST', credentials: 'include' })
  if (response.status === 401) return null
  if (!response.ok) throw new ApiError('Unable to restore your session.', response.status)
  return response.json() as Promise<LoginResponse>
}

export async function localSession(): Promise<LoginResponse | null> {
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/auth/local-session`, { method: 'POST', credentials: 'include' })
  if (response.status === 404) return null
  if (!response.ok) throw new ApiError('Unable to start the local session.', response.status)
  return response.json() as Promise<LoginResponse>
}

export async function logout(): Promise<void> {
  await fetch(`${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  })
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  let response: Response
  try {
    response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/auth/login`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include',
    })
  } catch {
    throw new ApiError('Unable to reach the NodeDeck API.')
  }

  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: string } | null
    throw new ApiError(error?.error === 'invalid_credentials' ? 'Invalid email or password.' : 'Unable to sign in.', response.status, error?.error)
  }
  return response.json() as Promise<LoginResponse>
}
