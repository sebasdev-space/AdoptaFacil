import { DocumentStatus, DocumentType } from '@adoptafacil/contracts';
import {
  computeVerificationLevel,
  effectiveStatus,
  satisfiedDocumentTypes,
  type DocumentSnapshot,
  type LevelRequirement,
} from './verification';

// A TEST catalog (the production one is empty — TODO(client)). This exercises the
// MECHANISM without inventing the real business catalog.
const LEVELS: LevelRequirement[] = [
  { level: 1, label: 'Básico', requiredDocuments: [DocumentType.Rut] },
  {
    level: 2,
    label: 'Verificada',
    requiredDocuments: [DocumentType.Rut, DocumentType.ExistenceRepresentationCertificate],
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
        LEVELS,
        NOW,
      );
      expect(level.level).toBe(0);
      expect(level.nextLevel).toBe(1);
      expect(level.blockedBy).toEqual([DocumentType.Rut]);
    });

    it('sits at level 0 with the empty production catalog (no requirement invented)', () => {
      const level = computeVerificationLevel(
        [doc(DocumentType.Rut, DocumentStatus.Approved, FUTURE)],
        [],
        NOW,
      );
      expect(level.level).toBe(0);
      expect(level.blockedBy).toBeUndefined();
    });
  });
});
