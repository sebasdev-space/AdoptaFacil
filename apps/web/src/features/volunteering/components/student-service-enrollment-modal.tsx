import { useState } from 'react';
import type { CreateVolunteerEnrollmentInput, VolunteerEnrollment } from '@adoptafacil/contracts';
import {
  Button,
  Dialog,
  DialogContent,
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
 * and supply the guardian data later if they do not have it at hand yet.
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base leading-snug">
            Inscripción a &quot;{opportunityTitle}&quot;
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Aviso de servicio social estudiantil */}
          <div className="flex gap-3 rounded-lg border border-info/30 bg-info/5 p-3">
            <span aria-hidden className="mt-0.5 shrink-0 text-base">
              🎓
            </span>
            <p className="text-xs text-muted-foreground">
              Esta oportunidad cuenta para el{' '}
              <strong className="text-foreground">servicio social estudiantil</strong> (Res.
              4210/1996). Si eres menor de edad, el nombre y documento de tu acudiente son
              necesarios para emitir la constancia — puedes agregarlos ahora o más adelante.
            </p>
          </div>

          {/* Checkbox: menor de edad */}
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm text-foreground transition-colors hover:bg-muted/40">
            <input
              type="checkbox"
              className="accent-primary"
              checked={isMinor}
              onChange={(e) => setIsMinor(e.target.checked)}
            />
            <span className="font-medium">Soy menor de edad</span>
          </label>

          {/* Datos del acudiente — visible solo si es menor */}
          {isMinor && (
            <div className="space-y-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-warning">
                Datos del acudiente
              </p>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-foreground">Nombre completo</label>
                <Input
                  aria-label="Nombre completo del acudiente"
                  placeholder="p. ej. María Gómez Pérez"
                  value={guardianName}
                  onChange={(e) => setGuardianName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-foreground">
                  Documento del acudiente
                </label>
                <Input
                  aria-label="Documento del acudiente"
                  placeholder="Cédula de ciudadanía"
                  value={guardianDocument}
                  onChange={(e) => setGuardianDocument(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Datos del colegio — siempre opcional */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Colegio (opcional)
            </p>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-foreground">
                Nombre del colegio
              </label>
              <Input
                aria-label="Colegio (opcional)"
                placeholder="p. ej. Colegio Nacional"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-foreground">
                Código de convenio institucional
              </label>
              <Input
                aria-label="Código de convenio institucional (opcional)"
                placeholder="Si tu colegio tiene convenio con el refugio"
                value={schoolAgreementCode}
                onChange={(e) => setSchoolAgreementCode(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button disabled={saving} onClick={() => void submit()}>
            {saving ? 'Enviando...' : 'Inscribirme'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
