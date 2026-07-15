import { create } from 'zustand'

export type ToastTone = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  title: string
  message?: string
  tone: ToastTone
}

interface ToastState {
  items: Toast[]
  push: (toast: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

let sequence = 0

export const useToasts = create<ToastState>((set) => ({
  items: [],
  push: (toast) => set((state) => ({ items: [...state.items, { ...toast, id: `toast-${Date.now()}-${sequence++}` }].slice(-4) })),
  dismiss: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
}))
