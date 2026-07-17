# @adoptafacil/ui

Single source of shared UI for AdoptaFácil — brand design tokens plus accessible,
token-themed components built with [Tailwind CSS](https://tailwindcss.com/) and
[shadcn/ui](https://ui.shadcn.com/) conventions (Radix primitives for the
interactive ones). Nothing here hardcodes a color, font, or radius: every visual
decision resolves to a CSS token, which is what makes the whole system
re-skinnable at runtime (§M14).

## Consuming it (already wired in `apps/web`)

1. **Import the stylesheet once**, at the app entry (before your own CSS):

   ```ts
   // apps/web/src/main.tsx
   import '@adoptafacil/ui/styles.css';
   ```

2. **Use the Tailwind preset** so utilities resolve to the tokens and the
   library's class names aren't purged:

   ```js
   // apps/web/tailwind.config.cjs
   module.exports = {
     presets: [require('@adoptafacil/ui/tailwind-preset')],
     content: [
       './index.html',
       './src/**/*.{ts,tsx}',
       '../../packages/ui/src/**/*.{ts,tsx}', // scan the library so classes survive
     ],
   };
   ```

3. **Import components** from the package root:

   ```tsx
   import { Button, Card, CardHeader, CardTitle, Input, toast } from '@adoptafacil/ui';
   ```

## Design tokens

Tokens live in [`src/styles/globals.css`](./src/styles/globals.css) as CSS custom
properties and are mapped to Tailwind theme keys in
[`tailwind-preset.cjs`](./tailwind-preset.cjs).

- **Colors** are stored as bare HSL channels (`"142 72% 29%"`) so opacity
  modifiers compose: `bg-primary/90`, `text-muted-foreground`.
  Pairs: `background/foreground`, `card`, `popover`, `primary`, `secondary`,
  `muted`, `accent`, `destructive`, `success`, `warning`, `info`, plus
  `border` / `input` / `ring`.
- **Typography**: `font-sans`, `font-display`, `font-mono` → `--font-*`.
- **Radii**: `rounded-sm|md|lg|xl` derive from `--radius`.

Brand direction: **green as the primary action**, a warm and trustworthy tone,
first-class dark mode.

### Light / dark

Dark mode is a `.dark` class on `<html>`. The app shell owns the toggle — see
[`apps/web/src/shell/theme`](../../apps/web/src/shell/theme). Components never
branch on the theme themselves; they read tokens, and the tokens change.

```tsx
import { ThemeProvider, ThemeToggle } from './shell/theme';

<ThemeProvider defaultTheme="system">
  <App />
  <ThemeToggle />
</ThemeProvider>;
```

> The theme state is held **in memory only** — no `localStorage`/`sessionStorage`
> in the library or the shell. Durable persistence, if wanted, plugs into
> `ThemeProvider`'s `defaultTheme` + `onThemeChange` and is defined separately.

### Runtime personalization (§M14)

Override any token on an element and everything beneath it re-skins — no
component changes. Helpers live in the shell's `tokens` module:

```tsx
import { applyBrandTokens, brandTokensToStyle } from './shell/theme';

// Whole app, imperatively:
applyBrandTokens({ primary: '24 90% 50%', radius: '1rem' });

// Or scoped to a subtree, declaratively:
<section style={brandTokensToStyle({ primary: '260 80% 55%' })}>…</section>;
```

## Components

| Component                                                    | Notes                                                                            |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `Button`                                                     | variants: default / outline / ghost · sizes: sm / default / lg                   |
| `Input`                                                      | native textbox; `aria-invalid` switches to the destructive token                 |
| `Select`                                                     | Radix listbox: typeahead + keyboard nav, `combobox`/`listbox` roles              |
| `Card` (+ `Header`/`Title`/`Description`/`Content`/`Footer`) | surface container                                                                |
| `Badge`                                                      | variants: default / secondary / outline / success / warning / destructive / info |
| `Dialog` (+ parts)                                           | Radix modal: focus trap, `Esc` to close, scroll lock, `aria-modal`               |
| `Tabs` (+ `List`/`Trigger`/`Content`)                        | Radix: roving focus, arrow-key nav                                               |
| `Toast` / `Toaster` / `useToast` / `toast()`                 | imperative feedback, `aria-live` region                                          |
| `Table` (+ parts)                                            | native `<table>` semantics, horizontal scroll wrapper                            |
| `Skeleton`                                                   | decorative loading placeholder (`aria-hidden`)                                   |
| `EmptyState`                                                 | "no data yet" region (`role="status"`) with icon/title/description/action        |

All components:

- are **accessible** — correct roles/ARIA and a visible focus ring on every
  focusable control;
- have **states** — hover / disabled, plus loading (`Skeleton`) and
  invalid (`Input`/`Select`) where relevant;
- are **themed only by tokens** — no hardcoded styles.

### Examples

```tsx
// Toast — mount <Toaster /> once near the root, then call toast() anywhere.
import { Toaster, toast } from '@adoptafacil/ui';

toast({ title: 'Guardado', description: 'La mascota fue registrada.', variant: 'success' });
```

```tsx
// Dialog
<Dialog>
  <DialogTrigger asChild>
    <Button>Confirmar adopción</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>¿Confirmar adopción?</DialogTitle>
      <DialogDescription>Esto notificará al refugio.</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <DialogClose asChild>
        <Button variant="outline">Cancelar</Button>
      </DialogClose>
      <Button>Confirmar</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

## Development

```bash
pnpm --filter @adoptafacil/ui lint       # eslint
pnpm --filter @adoptafacil/ui typecheck  # tsc --noEmit
pnpm --filter @adoptafacil/ui test       # vitest (render tests)
```

Each component ships a co-located `*.test.tsx` render test. Add new components as
new files under `src/components/`, export them from
[`src/index.ts`](./src/index.ts), and keep the additive rule: don't break the
existing `Button` or its tests.
