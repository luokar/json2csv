import { create } from "zustand";

export type InspectorMode = "column" | "mapping" | "row" | "table";
export type WorkbenchView = "csv" | "flat" | "relational" | "schema";

export interface SelectedWorkbenchColumn {
  header: string;
  view: WorkbenchView;
}

export interface SelectedWorkbenchRow {
  id: string;
  label: string;
  row: Record<string, string>;
  view: WorkbenchView;
}

interface WorkbenchState {
  activeView: WorkbenchView;
  inspectorMode: InspectorMode;
  isCommandPaletteOpen: boolean;
  isInspectorOpen: boolean;
  isLeftRailOpen: boolean;
  selectedColumn: SelectedWorkbenchColumn | null;
  selectedPresetId: number | null;
  selectedRow: SelectedWorkbenchRow | null;
  clearWorkbenchSelection: () => void;
  selectColumn: (column: SelectedWorkbenchColumn | null) => void;
  selectPreset: (selectedPresetId: number | null) => void;
  selectRow: (row: SelectedWorkbenchRow | null) => void;
  setActiveView: (activeView: WorkbenchView) => void;
  setCommandPaletteOpen: (isCommandPaletteOpen: boolean) => void;
  setInspectorMode: (inspectorMode: InspectorMode) => void;
  setInspectorOpen: (isInspectorOpen: boolean) => void;
  setLeftRailOpen: (isLeftRailOpen: boolean) => void;
}

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  activeView: "flat",
  inspectorMode: "mapping",
  isCommandPaletteOpen: false,
  isInspectorOpen: false,
  isLeftRailOpen: false,
  selectedColumn: null,
  selectedPresetId: null,
  selectedRow: null,
  clearWorkbenchSelection: () =>
    set({
      inspectorMode: "mapping",
      selectedColumn: null,
      selectedRow: null,
    }),
  selectColumn: (selectedColumn) =>
    set({
      inspectorMode: selectedColumn ? "column" : "mapping",
      selectedColumn,
      selectedRow: null,
    }),
  selectPreset: (selectedPresetId) => set({ selectedPresetId }),
  selectRow: (selectedRow) =>
    set({
      inspectorMode: selectedRow ? "row" : "mapping",
      selectedColumn: null,
      selectedRow,
    }),
  setActiveView: (activeView) => set({ activeView }),
  setCommandPaletteOpen: (isCommandPaletteOpen) => set({ isCommandPaletteOpen }),
  setInspectorMode: (inspectorMode) => set({ inspectorMode }),
  setInspectorOpen: (isInspectorOpen) => set({ isInspectorOpen }),
  setLeftRailOpen: (isLeftRailOpen) => set({ isLeftRailOpen }),
}));
