import { z } from 'zod';

/**
 * TODO(client): the AUTHORITATIVE document-type catalog is a business decision
 * the base document does not enumerate — this is a minimal, extensible starter
 * set of standard Colombian identity documents (same "extensible starter set"
 * convention already used for `OrganizationType`, org.ts). String values stable.
 */
export const LEGAL_REPRESENTATIVE_DOCUMENT_TYPES = [
  'cedula_ciudadania',
  'cedula_extranjeria',
  'pasaporte',
] as const;

// ~2 MB of base64 (~1.5 MB raw) is generous for a signature drawing/scan while
// still bounding the request body — mirrors STORAGE_MAX_FILE_MB's intent for
// this specific, always-small asset (never a full document scan).
const MAX_SIGNATURE_BASE64_LENGTH = 2_000_000;

const fullName = z.string().trim().min(1).max(200);
const position = z.string().trim().min(1).max(120);
const documentNumber = z.string().trim().min(1).max(50);

/** Register or re-sign the org's legal representative (Owner only). Every
 *  submission is a full re-registration — there is no partial-update endpoint,
 *  matching the append-only model (a "change" IS a new row, never a PATCH). */
export const registerLegalRepresentativeSchema = z
  .object({
    fullName,
    documentType: z.enum(LEGAL_REPRESENTATIVE_DOCUMENT_TYPES),
    documentNumber,
    position,
    /** Base64 of the signature image (no `data:` URL prefix). */
    signatureBase64: z.string().min(1).max(MAX_SIGNATURE_BASE64_LENGTH),
    signatureContentType: z.string().trim().min(1).max(100),
  })
  .strict();
