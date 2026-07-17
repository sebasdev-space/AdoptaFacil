import type { SVGProps } from 'react';

/**
 * Shell-local icon set for navigation and chrome.
 *
 * @adoptafacil/ui deliberately ships no icon package (its internal icons are for
 * its own primitives), so the app brings its own — kept dependency-free as inline
 * SVGs that inherit `currentColor` and the design-system stroke style. All icons
 * are decorative; callers provide the accessible label.
 */
export type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: '1em',
  height: '1em',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

export function HomeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 9.5 12 3l9 6.5" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

export function PawIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="5.5" cy="10.5" r="1.75" />
      <circle cx="9.5" cy="6.5" r="1.75" />
      <circle cx="14.5" cy="6.5" r="1.75" />
      <circle cx="18.5" cy="10.5" r="1.75" />
      <path d="M12 12.5c-2.6 0-4.5 1.9-4.5 4 0 1.7 1.3 2.5 3 2.5 .9 0 1.1-.4 1.5-.4s.6.4 1.5.4c1.7 0 3-.8 3-2.5 0-2.1-1.9-4-4.5-4Z" />
    </svg>
  );
}

export function HeartIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21l8.8-8.3a5 5 0 0 0 0-7.1Z" />
    </svg>
  );
}

export function MegaphoneIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m3 11 15-6v14L3 13v-2Z" />
      <path d="M3 11v2a2 2 0 0 0 2 2h1v4h3v-4" />
      <path d="M21 9v6" />
    </svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 5 6v5c0 4.2 2.9 8 7 9 4.1-1 7-4.8 7-9V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function AlertTriangleIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}
