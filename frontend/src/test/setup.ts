import '@testing-library/jest-dom/vitest';

// Node 26 exposes an undefined experimental localStorage when no backing file
// is configured. Keep browser-storage tests deterministic in jsdom.
if (typeof window !== 'undefined' && !window.localStorage) {
  const values = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => { values.set(key, String(value)); },
    },
  });
}
