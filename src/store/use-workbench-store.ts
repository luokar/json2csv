import { create } from "zustand";

interface WorkbenchState {
  selectedPresetId: number | null;
  selectPreset: (selectedPresetId: number | null) => void;
}

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  selectedPresetId: null,
  selectPreset: (selectedPresetId) => set({ selectedPresetId }),
}));
