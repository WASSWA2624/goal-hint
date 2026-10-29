/** Browser-local workspace geometry; no account or payment data is persisted. */
export const adminSidebarSize = { default: 232, min: 192, max: 320, collapsed: 56, handle: 6, contentMin: 720 } as const;
export const adminSidebarStorageKey = "goal-hint-admin-sidebar-v1";
type SidebarPreference = Readonly<{ collapsed: boolean; width: number }>;
const defaults: SidebarPreference = { collapsed: false, width: adminSidebarSize.default };
const listeners = new Set<() => void>();
let memory: SidebarPreference | null = null;

export function clampSidebarWidth(width: number, maximum: number = adminSidebarSize.max): number {
  return Math.round(Math.min(maximum, Math.max(adminSidebarSize.min, Number.isFinite(width) ? width : adminSidebarSize.default)));
}

export function readSidebarPreference(value: string | null): SidebarPreference {
  try {
    const parsed: unknown = JSON.parse(value ?? "null");
    if (!parsed || typeof parsed !== "object") return defaults;
    const setting = parsed as Record<string, unknown>;
    return { collapsed: setting.collapsed === true, width: typeof setting.width === "number" ? clampSidebarWidth(setting.width) : defaults.width };
  } catch { return defaults; }
}

function preference(): SidebarPreference {
  if (memory) return memory;
  try { return readSidebarPreference(window.localStorage.getItem(adminSidebarStorageKey)); }
  catch { return defaults; }
}

/** Stable primitives let the server and hydration agree before loading the saved preference. */
export const getServerSidebarSnapshot = () => "0:232:320";
export function getSidebarSnapshot(): string {
  if (typeof window === "undefined") return getServerSidebarSnapshot();
  const setting = preference();
  const rootWidth = typeof document === "undefined" ? 0 : document.documentElement.getBoundingClientRect().width;
  // A stable scrollbar gutter can make the rendered root narrower than innerWidth/clientWidth.
  const availableWidth = Number.isFinite(rootWidth) && rootWidth > 0 ? Math.min(window.innerWidth, Math.floor(rootWidth)) : window.innerWidth;
  const maximum = Math.min(adminSidebarSize.max, Math.max(adminSidebarSize.min, availableWidth - adminSidebarSize.contentMin - adminSidebarSize.handle));
  return `${setting.collapsed ? 1 : 0}:${clampSidebarWidth(setting.width, maximum)}:${maximum}`;
}

export function saveSidebarPreference(): void {
  try { window.localStorage.setItem(adminSidebarStorageKey, JSON.stringify(preference())); }
  catch { /* Layout controls still work when browser storage is unavailable. */ }
}

export function setSidebarPreference(patch: Partial<SidebarPreference>, persist = true): void {
  const previous = preference();
  memory = { collapsed: patch.collapsed ?? previous.collapsed, width: clampSidebarWidth(patch.width ?? previous.width) };
  if (persist) saveSidebarPreference();
  for (const listener of listeners) listener();
}

export function subscribeSidebarPreference(listener: () => void): () => void {
  listeners.add(listener);
  const onResize = () => listener();
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== adminSidebarStorageKey) return;
    memory = null;
    listener();
  };
  window.addEventListener("resize", onResize);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("storage", onStorage);
  };
}
