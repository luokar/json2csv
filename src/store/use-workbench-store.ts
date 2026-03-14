import { create } from 'zustand'

interface WorkbenchState {
  search: string
  selectedPresetId: number | null
  setSearch: (search: string) => void
  selectPreset: (selectedPresetId: number | null) => void
}

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  search: '',
  selectedPresetId: null,
  setSearch: (search) => set({ search }),
  selectPreset: (selectedPresetId) => set({ selectedPresetId }),
}))
