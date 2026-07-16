const uiPreset = require('@adoptafacil/ui/tailwind-preset');

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [uiPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    // Scan the shared UI library so its class names are not purged.
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: { extend: {} },
  plugins: [],
};
