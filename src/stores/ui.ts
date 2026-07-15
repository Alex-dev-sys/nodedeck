import { create } from 'zustand'

interface UIState {
  sidebarCollapsed: boolean
  toggleSidebar: () => void

  commandOpen: boolean
  setCommandOpen: (v: boolean) => void

  // service id currently open in the detail drawer, or null
  drawerServiceId: string | null
  openDrawer: (id: string) => void
  closeDrawer: () => void

  demoTourOpen: boolean
  demoTourStep: number
  openDemoTour: () => void
  closeDemoTour: () => void
  setDemoTourStep: (step: number) => void
}

export const useUI = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  commandOpen: false,
  setCommandOpen: (v) => set({ commandOpen: v }),

  drawerServiceId: null,
  openDrawer: (id) => set({ drawerServiceId: id }),
  closeDrawer: () => set({ drawerServiceId: null }),

  demoTourOpen: false,
  demoTourStep: 0,
  openDemoTour: () => set({ demoTourOpen: true, demoTourStep: 0 }),
  closeDemoTour: () => set({ demoTourOpen: false }),
  setDemoTourStep: (demoTourStep) => set({ demoTourStep }),
}))
