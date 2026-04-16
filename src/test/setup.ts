import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

beforeEach(() => {
  vi.stubGlobal("Worker", undefined);
});
