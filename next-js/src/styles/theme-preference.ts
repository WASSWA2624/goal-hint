export type ThemeMode = "light" | "dark";

export const themeStorageKey = "goal-hint-theme";
export const themePreferenceAttribute = "data-goal-hint-theme";

/** Set an explicit preference before styled controls can paint. CSS handles the system default. */
export const themePreferenceBootstrap = `try{const mode=localStorage.getItem(${JSON.stringify(themeStorageKey)});if(mode==='light'||mode==='dark')document.documentElement.setAttribute(${JSON.stringify(themePreferenceAttribute)},mode)}catch{}`;

export function storedThemeMode(value: string | null): ThemeMode | null {
  return value === "light" || value === "dark" ? value : null;
}

export function resolveThemeMode(value: string | null, prefersDark: boolean): ThemeMode {
  return storedThemeMode(value) ?? (prefersDark ? "dark" : "light");
}

const listeners = new Set<() => void>();
let memoryPreference: ThemeMode | null = null;

/** A stable primitive snapshot; blocked storage still permits a working in-memory toggle. */
export function getThemeSnapshot(): ThemeMode {
  if (typeof window === "undefined") return "light";
  let stored: ThemeMode | null = null;
  try { stored = storedThemeMode(window.localStorage.getItem(themeStorageKey)); } catch { /* Private storage may be disabled. */ }
  return memoryPreference ?? stored ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

/** Server and hydration render agree before React subscribes to the browser preference. */
export const getServerThemeSnapshot = (): ThemeMode => "light";

export function setThemePreference(mode: ThemeMode): void {
  memoryPreference = mode;
  document.documentElement.setAttribute(themePreferenceAttribute, mode);
  try { window.localStorage.setItem(themeStorageKey, mode); } catch { /* Keep the preference for this page. */ }
  for (const listener of listeners) listener();
}

export function subscribeThemePreference(listener: () => void): () => void {
  listeners.add(listener);
  const browser = window;
  const media = browser.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => listener();
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== themeStorageKey) return;
    memoryPreference = null;
    const mode = storedThemeMode(event.newValue);
    if (mode) document.documentElement.setAttribute(themePreferenceAttribute, mode);
    else document.documentElement.removeAttribute(themePreferenceAttribute);
    listener();
  };
  browser.addEventListener("storage", onStorage);
  media.addEventListener("change", onSystemChange);
  return () => {
    listeners.delete(listener);
    browser.removeEventListener("storage", onStorage);
    media.removeEventListener("change", onSystemChange);
  };
}
