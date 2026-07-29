import type { ComponentType } from 'react';
import type { DocumentType } from '@adoptafacil/contracts';

/**
 * Feature-local, dependency-free icon set for the document-type cards (T-D04).
 * Mirrors the inline-SVG pattern used elsewhere (e.g. the portal's external-link
 * icon) — no icon library added, `packages/ui` untouched.
 */
type IconProps = { className?: string };

const base = {
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

/** RUT — fiscal document (page with a percent/tax mark). */
function RutIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="m9 17 6-6" />
      <circle cx="9.75" cy="11.75" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="14.25" cy="16.25" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Certificado de existencia y representación — document with a seal/ribbon. */
function CertificateIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <circle cx="12" cy="14" r="2.25" />
      <path d="m10.4 15.8-.9 3.2 2.5-1.2 2.5 1.2-.9-3.2" />
    </svg>
  );
}

/** Documento del representante legal — an ID card with a person silhouette. */
function IdCardIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6 16c.6-1.6 1.9-2.5 3-2.5s2.4.9 3 2.5" />
      <path d="M14 9.5h4" />
      <path d="M14 13h4" />
    </svg>
  );
}

/** Otro documento — generic folder. */
function FolderIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

/** Upload prompt for an empty ("sin subir") card. */
export function UploadCloudIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M7 18a4 4 0 0 1-1-7.9A5 5 0 0 1 16 8h.5a3.5 3.5 0 0 1 0 7H17" />
      <path d="M12 12v7" />
      <path d="m9.5 14.5 2.5-2.5 2.5 2.5" />
    </svg>
  );
}

const ICON_BY_TYPE: Record<string, ComponentType<IconProps>> = {
  rut: RutIcon,
  existence_representation_certificate: CertificateIcon,
  legal_representative_id: IdCardIcon,
  other: FolderIcon,
};

/** Representative icon for a `DocumentType` — falls back to the generic folder. */
export function DocumentTypeIcon({ type, className }: { type: DocumentType; className?: string }) {
  const Icon = ICON_BY_TYPE[type as string] ?? FolderIcon;
  return <Icon className={className} />;
}
