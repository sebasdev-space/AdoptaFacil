// Adds jest-dom matchers (toBeInTheDocument, toHaveClass, …) to Vitest's expect
// and polyfills the DOM APIs the shell's UI primitives touch under jsdom.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount React trees between tests so the drawer/overlay portals don't leak.
afterEach(() => cleanup());

// jsdom does not implement matchMedia; the ThemeProvider and responsive helpers
// read it. Default to "no match" (light theme, desktop) unless a test overrides it.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
