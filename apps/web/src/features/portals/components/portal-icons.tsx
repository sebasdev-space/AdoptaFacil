/**
 * Iconografía del portal público (§M14, rediseño T-D03/T-D04). SVGs a mano,
 * sin librería nueva — mismo criterio ya usado en el código existente
 * (`PawPlaceholder`, el ícono de lupa de `PortalAdoptionSection`, `LinkIcon`
 * de `PortalSocialLinks`). Glifos genéricos reconocibles, no logos de marca
 * pixel-perfect.
 */
import type { SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    'aria-hidden': true,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...props,
  };
}

export function IconPaw(props: IconProps) {
  return (
    <svg {...base(props)} fill="currentColor" stroke="none">
      <circle cx="7" cy="8" r="2.2" />
      <circle cx="12" cy="5.5" r="2.2" />
      <circle cx="17" cy="8" r="2.2" />
      <path d="M12 12c-3.5 0-6.5 2.3-6.5 5.2 0 2 1.7 2.8 3.3 2 1-.5 2-1 3.2-1s2.2.5 3.2 1c1.6.8 3.3 0 3.3-2 0-2.9-3-5.2-6.5-5.2Z" />
    </svg>
  );
}

export function IconDog(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 10c0-3 2.5-6 5.5-6.5M19 10c0-3-2.5-6-5.5-6.5" />
      <path d="M6 10c-1.5 1-2 3-1.5 5.5C5 18 7 20 10 20h4c3 0 5-2 5.5-4.5.5-2.5 0-4.5-1.5-5.5-1.5-1-4-1.5-6-1.5s-4.5.5-6 1.5Z" />
      <circle cx="9.5" cy="13.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="13.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconCat(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 9 4 4l4 2.5" />
      <path d="M18 9l2-5-4 2.5" />
      <path d="M6 9c0-1.7 2.7-3 6-3s6 1.3 6 3v5c0 3.3-2.7 6-6 6s-6-2.7-6-6V9Z" />
      <path d="M10.5 15c.5.5 2.5.5 3 0" />
    </svg>
  );
}

export function IconHome(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

export function IconHeart(props: IconProps & { filled?: boolean }) {
  const { filled, ...rest } = props;
  return (
    <svg {...base(rest)} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 20.5s-7.5-4.6-9.8-9.2C.6 8 2 4.8 5.2 4.1c2-.4 3.9.5 5.2 2.4C11.6 4.6 13.6 3.7 15.6 4c3.2.7 4.6 3.9 3 7.2-2.3 4.7-9.8 9.3-9.8 9.3Z" />
    </svg>
  );
}

export function IconGift(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="9" width="16" height="4" rx="0.5" />
      <path d="M5 13h14v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7Z" />
      <path d="M12 9v12" />
      <path d="M12 9C10 9 8 7.9 8 6.3 8 5 9 4 10.2 4 11.6 4 12 6 12 9Z" />
      <path d="M12 9c2 0 4-1.1 4-2.7C16 5 15 4 13.8 4 12.4 4 12 6 12 9Z" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function IconGrid(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

export function IconList(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

export function IconRuler(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="8" width="18" height="8" rx="1.5" />
      <path d="M7 8v3M11 8v3M15 8v3M19 8v3" />
    </svg>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

export function IconGender(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="14" r="5" />
      <path d="M15.5 3h5v5" />
      <path d="M20 4 13 11" />
    </svg>
  );
}

export function IconMail(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

export function IconGlobe(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 4 6 4 9s-1.5 6.5-4 9c-2.5-2.5-4-6-4-9s1.5-6.5 4-9Z" />
    </svg>
  );
}

export function IconWhatsapp(props: IconProps) {
  return (
    <svg {...base(props)} fill="currentColor" stroke="none">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm5.3 14.3c-.2.6-1.3 1.2-1.9 1.3-.5.1-1.1.1-1.8-.1a13 13 0 0 1-5.5-3.9 6.9 6.9 0 0 1-1.5-3.6c0-.9.5-1.5.8-1.8.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.7 1.9c.1.2.1.4 0 .6l-.4.5c-.1.2-.2.3-.1.5.4.8 1 1.5 1.7 2.1.7.6 1.4 1 2.2 1.3.2.1.4.1.5-.1l.5-.6c.2-.2.4-.2.6-.1l1.7.9c.2.1.3.2.3.4 0 .3-.1.6-.2 1Z" />
    </svg>
  );
}

export function IconInstagram(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconFacebook(props: IconProps) {
  return (
    <svg {...base(props)} fill="currentColor" stroke="none">
      <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.4c0-.9.2-1.5 1.5-1.5h1.5V4.2C15.9 4.1 15 4 13.9 4c-2.4 0-4 1.5-4 4.1v2.4H7.3v3h2.6V21h3.6Z" />
    </svg>
  );
}

export function IconTikTok(props: IconProps) {
  return (
    <svg {...base(props)} fill="currentColor" stroke="none">
      <path d="M14.5 3h2.1c.2 1.6 1.3 2.9 3.1 3.2v2.2c-1.2 0-2.3-.4-3.2-1v6.4a4.9 4.9 0 1 1-4.9-4.9c.2 0 .5 0 .7.1v2.2a2.7 2.7 0 1 0 1.9 2.6V3Z" />
    </svg>
  );
}

export function IconBowl(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 11h18a1 1 0 0 1 1 1c0 4.4-4.5 8-10 8S2 16.4 2 12a1 1 0 0 1 1-1Z" />
      <path d="M8 11c0-2.8 1.8-5 4-5s4 2.2 4 5" />
    </svg>
  );
}

export function IconCross(props: IconProps) {
  return (
    <svg {...base(props)} fill="currentColor" stroke="none">
      <path d="M10 3h4v6h6v4h-6v6h-4v-6H4V9h6V3Z" />
    </svg>
  );
}

export function IconBox(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.3 7 12 11.5 20.7 7" />
      <path d="M12 21V11.5" />
      <path d="m3.3 7 8.7-4.5L20.7 7 12 11.5 3.3 7Z" />
      <path d="M20.7 7v10L12 21 3.3 17V7" />
    </svg>
  );
}

export function IconYoutube(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="3.5" />
      <path d="M10.5 9.5v5l4.5-2.5-4.5-2.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
