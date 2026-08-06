'use client';

/**
 * Persists AppShell sidebar UI across layout remounts (e.g. /admin ↔ /directory),
 * refresh, and back/forward. Route changes must not reset collapse/scroll.
 */

const COLLAPSED_KEY = 'falcon.sidebar.collapsed';
const SCROLL_KEY = 'falcon.sidebar.navScroll';
const COLLAPSED_EVENT = 'falcon-sidebar-collapsed';

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

let collapsedMemory: boolean | null = null;

export function readSidebarCollapsed(defaultValue = false): boolean {
  if (collapsedMemory != null) return collapsedMemory;
  if (!canUseStorage()) return defaultValue;
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY);
    if (raw === null) return defaultValue;
    collapsedMemory = raw === '1' || raw === 'true';
    return collapsedMemory;
  } catch {
    return defaultValue;
  }
}

export function writeSidebarCollapsed(collapsed: boolean) {
  collapsedMemory = collapsed;
  if (canUseStorage()) {
    try {
      window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore quota / private mode */
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(COLLAPSED_EVENT));
  }
}

export function subscribeSidebarCollapsed(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  const handler = () => onStoreChange();
  window.addEventListener(COLLAPSED_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(COLLAPSED_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

export function getSidebarCollapsedSnapshot(): boolean {
  return readSidebarCollapsed(false);
}

export function getSidebarCollapsedServerSnapshot(): boolean {
  return false;
}

export function readSidebarScroll(): number {
  if (!canUseStorage()) return 0;
  try {
    const raw = window.localStorage.getItem(SCROLL_KEY);
    const n = raw == null ? 0 : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function writeSidebarScroll(scrollTop: number) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(SCROLL_KEY, String(Math.max(0, Math.round(scrollTop))));
  } catch {
    /* ignore */
  }
}
