import { DocumentStatus, DocumentType, FormalizationState } from '@adoptafacil/contracts';
import {
  computeVerificationLevel,
  effectiveStatus,
  satisfiedDocumentTypes,
  type DocumentSnapshot,
  type LevelRequirement,
} from './verification';

// A TEST catalog — exercises the MECHANISM without depending on the real
// production ladder (VERIFICATION_LEVELS), which can be redefined by the
// client without touching this file.
const LEVELS: LevelRequirement[] = [
  { level: 1, label: 'Básico', requiredDocuments: [DocumentType.Rut] },
  {
    level: 2,
    label: 'Verificada',
    requiredDocuments: [DocumentType.Rut, DocumentType.ExistenceRepresentationCertificate],
  },
];

// A catalog with a formalization-gated top tier, for the formalization tests.
const LEVELS_WITH_FORMALIZATION: LevelRequirement[] = [
  { level: 1, label: 'Básico', requiredDocuments: [DocumentType.Rut] },
  {
    level: 2,
    label: 'Confiable',
    requiredDocuments: [DocumentType.Rut],
    minFormalizationState: FormalizationState.Formalizada,
  },
];

const NOW = new Date('2026-07-22T00:00:00.000Z');
const FUTURE = new Date('2027-01-01T00:00:00.000Z');
const PAST = new Date('2026-01-01T00:00:00.000Z');

function doc(
  type: DocumentType,
  status: DocumentStatus,
  expiresAt: Date | null = null,
): DocumentSnapshot {
  return { type, status, expiresAt };
}

describe('verification level computation (T-103)', () => {
  describe('effectiveStatus (expiry evaluated at read time)', () => {
    it('marks an Approved document past its expiry as Expired', () => {
      expect(effectiveStatus(DocumentStatus.Approved, PAST, NOW)).toBe(DocumentStatus.Expired);
    });
    it('keeps an Approved document with a future expiry Approved', () => {
      expect(effectiveStatus(DocumentStatus.Approved, FUTURE, NOW)).toBe(DocumentStatus.Approved);
    });
    it('keeps an Approved document with no expiry Approved', () => {
      expect(effectiveStatus(DocumentStatus.Approved, null, NOW)).toBe(DocumentStatus.Approved);
    });
    it('never expires a non-Approved status', () => {
      expect(effectiveStatus(DocumentStatus.Pending, PAST, NOW)).toBe(DocumentStatus.Pending);
    });
  });

  describe('satisfiedDocumentTypes (approved AND vigente)', () => {
    it('includes only Approved & current documents', () => {
      const satisfied = satisfiedDocumentTypes(
        [
          doc(DocumentType.Rut, DocumentStatus.Approved, FUTURE),
          doc(DocumentType.LegalRepresentativeId, DocumentStatus.Pending),
          doc(DocumentType.ExistenceRepresentationCertificate, DocumentStatus.Approved, PAST),
        ],
        NOW,
      );
      expect([...satisfied]).toEqual([DocumentType.Rut]);
    });
  });

  describe('computeVerificationLevel', () => {
    it('reaches the top tier when ALL required documents are approved & current', () => {
      const level = computeVerificationLevel(
        [
          doc(DocumentType.Rut, DocumentStatus.Approved, FUTURE),
          doc(DocumentType.ExistenceRepresentationCertificate, DocumentStatus.Approved, null),
        ],
        FormalizationState.Informal,
        LEVELS,
        NOW,
      );
      expect(level.level).toBe(2);
      expect(level.label).toBe('Verificada');
      expect(level.blockedBy).toBeUndefined();
    });

    it('blocks a tier whose required document is EXPIRED (holds at the lower tier)', () => {
      const level = computeVerificationLevel(
        [
          doc(DocumentType.Rut, DocumentStatus.Approved, FUTURE),
          // required for level 2 but expired → level 2 blocked, level 1 kept.
          doc(DocumentType.ExistenceRepresentationCertificate, DocumentStatus.Approved, PAST),
        ],
        FormalizationState.Informal,
        LEVELS,
        NOW,
      );
      expect(level.level).toBe(1);
      expect(level.nextLevel).toBe(2);
      expect(level.blockedBy).toEqual([DocumentType.ExistenceRepresentationCertificate]);
    });

    it('stays at level 0 when a lower tier is not met', () => {
      const level = computeVerificationLevel(
        [doc(DocumentType.Rut, DocumentStatus.Pending)],
        FormalizationState.Informal,
        LEVELS,
        NOW,
      );
      expect(level.level).toBe(0);
      expect(level.nextLevel).toBe(1);
      expect(level.blockedBy).toEqual([DocumentType.Rut]);
    });

    it('sits at level 0 with an empty catalog (mechanism invents no requirement)', () => {
      const level = computeVerificationLevel(
        [doc(DocumentType.Rut, DocumentStatus.Approved, FUTURE)],
        FormalizationState.Informal,
        [],
        NOW,
      );
      expect(level.level).toBe(0);
      expect(level.blockedBy).toBeUndefined();
    });

    it('blocks a formalization-gated tier when documents are met but formalization is below the floor', () => {
      const level = computeVerificationLevel(
        [doc(DocumentType.Rut, DocumentStatus.Approved, FUTURE)],
        FormalizationState.EnProceso,
        LEVELS_WITH_FORMALIZATION,
        NOW,
      );
      expect(level.level).toBe(1);
      expect(level.nextLevel).toBe(2);
      expect(level.blockedBy).toEqual([`formalization:${FormalizationState.Formalizada}`]);
    });

    it('reaches a formalization-gated tier once formalization meets the floor', () => {
      const level = computeVerificationLevel(
        [doc(DocumentType.Rut, DocumentStatus.Approved, FUTURE)],
        FormalizationState.ESAL,
        LEVELS_WITH_FORMALIZATION,
        NOW,
      );
      expect(level.level).toBe(2);
      expect(level.blockedBy).toBeUndefined();
    });
  });
});
