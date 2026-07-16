/**
 * Shared Tailwind preset (provisional AdoptaFácil brand tokens).
 * Consumed by apps/web via `presets: [require('@adoptafacil/ui/tailwind-preset')]`.
 * Dark mode toggles with the `.dark` class on <html>. Fabián owns the full design
 * system (Ola 0); these tokens only need to compile and look coherent.
 */
/** @type {Partial<import('tailwindcss').Config>} */
module.exports = {
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};
