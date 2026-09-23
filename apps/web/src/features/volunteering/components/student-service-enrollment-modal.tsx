import { useState } from 'react';
import type { CreateVolunteerEnrollmentInput, VolunteerEnrollment } from '@adoptafacil/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  useToast,
} from '@adoptafacil/ui';
import { isIncompleteProfileError, useApiClient } from '../../../shell/api';

export interface StudentServiceEnrollmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId: string;
  opportunityTitle: string;
  onEnrolled: () => void;
  /** Same T-Google-SignIn handoff `my-volunteering-page.tsx` already does for
   *  the direct-enroll path — kept here so this modal can trigger it too. */
  onIncompleteProfile: () => void;
}

/**
 * S-12 (M08, FSD v3.5 Doc 8) — collected ONLY for opportunities marked
 * `appliesToStudentService`; a plain volunteering signup never sees this
 * modal (see `my-volunteering-page.tsx`, which branches before rendering it).
 * Nothing here is REQUIRED to submit — the guardian info gate is enforced at
 * certificate issuance (org side), not at signup, so a minor can enroll now
 * and supply the guardian's data later if they don't have it at hand yet.
 */
export function StudentServiceEnrollmentModal({
  open,
  onOpenChange,
  opportunityId,
  opportunityTitle,
  onEnrolled,
  onIncompleteProfile,
}: StudentServiceEnrollmentModalProps) {
  const client = useApiClient();
  const { toast } = useToast();
  const [isMinor, setIsMinor] = useState(false);
  const [guardianName, setGuardianName] = useState('');
  const [guardianDocument, setGuardianDocument] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [schoolAgreementCode, setSchoolAgreementCode] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = (): void => {
    setIsMinor(false);
    setGuardianName('');
    setGuardianDocument('');
    setSchoolName('');
    setSchoolAgreementCode('');
  };

  const submit = async (): Promise<void> => {
    const input: CreateVolunteerEnrollmentInput = {
      opportunityId,
      isMinor,
      guardianName: guardianName.trim() || undefined,
      guardianDocument: guardianDocument.trim() || undefined,
      schoolName: schoolName.trim() || undefined,
      schoolAgreementCode: schoolAgreementCode.trim() || undefined,
    };
    setSaving(true);
    try {
      await client.request<VolunteerEnrollment>('/volunteer-enrollments', {
        method: 'POST',
        json: input,
      });
      reset();
      onOpenChange(false);
      onEnrolled();
      toast({ title: 'Inscripción enviada', variant: 'success' });
    } catch (error) {
      if (isIncompleteProfileError(error)) {
        onOpenChange(false);
        onIncompleteProfile();
        return;
      }
      toast({
        title: 'No se pudo completar la inscripción',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inscripción a "{opportunityTitle}"</DialogTitle>
          <DialogDescription>
            Esta oportunidad cuenta para el servicio social estudiantil (Resolución 4210/1996). Si
            eres menor de edad, el nombre y documento de tu acudiente serán obligatorios antes de
            que el refugio pueda emitir tu constancia — puedes agregarlos ahora o más adelante.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isMinor}
              onChange={(e) => setIsMinor(e.target.checked)}
            />
            Soy menor de edad
          </label>

          {isMinor && (
            <div className="space-y-2 rounded-md border border-input p-3">
              <Input
                aria-label="Nombre completo del acudiente"
                placeholder="Nombre completo del acudiente"
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
              />
              <Input
                aria-label="Documento del acudiente"
                placeholder="Documento del acudiente"
                value={guardianDocument}
                onChange={(e) => setGuardianDocument(e.target.value)}
              />
            </div>
          )}

          <Input
            aria-label="Colegio (opcional)"
            placeholder="Colegio (opcional)"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
          />
          <Input
            aria-label="Código de convenio institucional (opcional)"
            placeholder="Código de convenio institucional (opcional)"
            value={schoolAgreementCode}
            onChange={(e) => setSchoolAgreementCode(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button disabled={saving} onClick={() => void submit()}>
            {saving ? 'Enviando…' : 'Inscribirme'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
