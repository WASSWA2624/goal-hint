import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type ViewPreferences = { density: "comfortable" | "compact" };
export const preferencesStorageKey = "goal-hint:preferences:v1";
export const preferencesSlice = createSlice({
  name: "preferences", initialState: { density: "comfortable" } as ViewPreferences,
  reducers: {
    preferencesChanged(_state, { payload }: PayloadAction<ViewPreferences>) {
      if (payload.density !== "comfortable" && payload.density !== "compact") throw new RangeError("Invalid view preference.");
      return { density: payload.density };
    },
  },
});
export const { preferencesChanged } = preferencesSlice.actions;
export function readPreferences(value: string | null): ViewPreferences | null {
  if (!value || value.length > 128) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Object.keys(parsed).sort().join() !== "density,version" ||
        !("version" in parsed) || parsed.version !== 1 || !("density" in parsed) ||
        parsed.density !== "comfortable" && parsed.density !== "compact") return null;
    return { density: parsed.density };
  } catch { return null; }
}
export function serializePreferences(preferences: ViewPreferences): string {
  const value = JSON.stringify({ version: 1, density: preferences.density });
  if (!readPreferences(value)) throw new RangeError("Invalid view preference.");
  return value;
}
