import { useEffect, useState } from 'react';
import type {
  AnimalBehaviorDisclosure,
  ChildrenCompatibility,
  CreateAnimalBehaviorDisclosureInput,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { SelectField, TextAreaField } from './animal-form-fields';

const CHILDREN_COMPATIBILITY_OPTIONS: readonly { value: ChildrenCompatibility; label: string }[] = [
  { value: 'yes', label: 'Sí' },
  { value: 'with_supervision', label: 'Con supervisión' },
  { value: 'not_recommended', label: 'No recomendado' },
];

const CHILDREN_COMPATIBILITY_LABELS: Record<ChildrenCompatibility, string> = {
  yes: 'Sí',
  with_supervision: 'Con supervisión',
  not_recommended: 'No recomendado',
};

const BITE_HISTORY_OPTIONS = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Sí' },
] as const;

export interface AnimalBehaviorDisclosureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animalId: string;
  animalName: string;
}

type LoadState = 'loading' | 'ready' | 'error';

/**
 * S-9 (M03, FSD v3.5 Doc 4 — "Safe Harbor" del refugio, Art. 2353 inciso 2
 * C.C.). Declara Y firma en un solo paso (no hay "firmar después" — el
 * backend sella el hash en el mismo INSERT, ver
 * `AnimalBehaviorDisclosureService.create`). Declarar de nuevo NUNCA edita la
 * declaración anterior: crea una versión nueva que pasa a ser la vigente — el
 * historial completo queda auditado server-side aunque esta vista solo
 * muestre la más reciente.
 *
 * Consume `GET/POST /animals/:id/behavior-disclosures[/current]`
 * (`AnimalBehaviorDisclosureController`). M04 (Fabián) lee la vigente por su
 * propia vía cross-módulo (`animal_behavior_disclosure_current()`, SQL) para
 * bloquear la generación de comodatos — esta vista no depende de eso.
 */
export function AnimalBehaviorDisclosureModal({
  open,
  onOpenChange,
  animalId,
  animalName,
}: AnimalBehaviorDisclosureModalProps) {
  const client = useApiClient();
  const { toast } = useToast();
  const [state, setState] = useState<LoadState>('loading');
  const [current, setCurrent] = useState<AnimalBehaviorDisclosure | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [signedByName, setSignedByName] = useState('');
  const [reactivityNotes, setReactivityNotes] = useState('');
  const [biteHistory, setBiteHistory] = useState<'no' | 'yes'>('no');
  const [biteHistoryDetail, setBiteHistoryDetail] = useState('');
  const [childrenCompatibility, setChildrenCompatibility] = useState<ChildrenCompatibility>('yes');
  const [medicalConditionsRelevant, setMedicalConditionsRelevant] = useState('');

  useEffect(() => {
    if (!open) return;
    let active = true;
    setState('loading');
    setEditing(false);
    client
      .request<AnimalBehaviorDisclosure | null>(`/animals/${animalId}/behavior-disclosures/current`)
      .then((disclosure) => {
        if (!active) return;
        setCurrent(disclosure ?? null);
        setState('ready');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [client, animalId, open]);

  function startDeclaration(): void {
    setSignedByName('');
    setReactivityNotes(current?.reactivityNotes ?? '');
    setBiteHistory(current?.biteHistory ? 'yes' : 'no');
    setBiteHistoryDetail(current?.biteHistoryDetail ?? '');
    setChildrenCompatibility(current?.childrenCompatibility ?? 'yes');
    setMedicalConditionsRelevant(current?.medicalConditionsRelevant ?? '');
    setEditing(true);
  }

  async function submit(): Promise<void> {
    if (!signedByName.trim()) {
      toast({
        title: 'Falta el nombre del firmante',
        description: 'Escribe el nombre completo de quien firma esta declaración.',
        variant: 'warning',
      });
      return;
    }
    if (biteHistory === 'yes' && !biteHistoryDetail.trim()) {
      toast({
        title: 'Falta el detalle del antecedente',
        description: 'Describe brevemente el antecedente de mordida declarado.',
        variant: 'warning',
      });
      return;
    }

    const input: CreateAnimalBehaviorDisclosureInput = {
      signedByName: signedByName.trim(),
      biteHistory: biteHistory === 'yes',
      childrenCompatibility,
      reactivityNotes: reactivityNotes.trim() || undefined,
      biteHistoryDetail: biteHistory === 'yes' ? biteHistoryDetail.trim() : undefined,
      medicalConditionsRelevant: medicalConditionsRelevant.trim() || undefined,
    };

    setSaving(true);
    try {
      const created = await client.request<AnimalBehaviorDisclosure>(
        `/animals/${animalId}/behavior-disclosures`,
        { method: 'POST', json: input },
      );
      setCurrent(created);
      setEditing(false);
      toast({
        title: 'Declaración firmada',
        description: `Ya puedes generar salidas temporales u hogar de paso para ${animalName}.`,
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'No se pudo firmar la declaración',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Declaración de comportamiento de {animalName}</DialogTitle>
          <DialogDescription>
            Paso obligatorio antes de cualquier salida temporal u hogar de paso (Art. 2353 inciso 2
            C.C.). Declarar de nuevo no borra el historial — cada firma queda registrada.
          </DialogDescription>
        </DialogHeader>

        {state === 'loading' && <Skeleton className="h-40 w-full" />}
        {state === 'error' && (
          <p className="text-sm text-destructive">
            No se pudo cargar la declaración. Inténtalo de nuevo.
          </p>
        )}

        {state === 'ready' && !editing && (
          <div className="space-y-3">
            {current ? (
              <div className="space-y-2 rounded-md border border-input p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">Declaración vigente</span>
                  <Badge variant="success">Firmada</Badge>
                </div>
                <p>
                  <span className="text-muted-foreground">Compatibilidad con niños: </span>
                  {CHILDREN_COMPATIBILITY_LABELS[current.childrenCompatibility]}
                </p>
                <p>
                  <span className="text-muted-foreground">Antecedente de mordida: </span>
                  {current.biteHistory ? `Sí — ${current.biteHistoryDetail}` : 'No'}
                </p>
                {current.reactivityNotes && (
                  <p>
                    <span className="text-muted-foreground">Reactividad: </span>
                    {current.reactivityNotes}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Firmado por {current.signedByName} ·{' '}
                  {new Date(current.declaredAt).toLocaleDateString('es-CO')}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {animalName} todavía no tiene una declaración de comportamiento firmada.
              </p>
            )}
            <Button onClick={startDeclaration}>
              {current ? 'Declarar de nuevo' : 'Declarar y firmar'}
            </Button>
          </div>
        )}

        {state === 'ready' && editing && (
          <div className="space-y-3">
            <SelectField<ChildrenCompatibility>
              id="behavior-children-compatibility"
              label="¿Es compatible con niños?"
              value={childrenCompatibility}
              onChange={setChildrenCompatibility}
              options={CHILDREN_COMPATIBILITY_OPTIONS}
            />
            <TextAreaField
              id="behavior-reactivity-notes"
              label="Reactividad con otros animales (opcional)"
              value={reactivityNotes}
              onChange={setReactivityNotes}
              rows={2}
              placeholder="Ej. reactivo con gatos, sociable con perros"
            />
            <SelectField<'no' | 'yes'>
              id="behavior-bite-history"
              label="¿Tiene antecedentes de mordida?"
              value={biteHistory}
              onChange={setBiteHistory}
              options={BITE_HISTORY_OPTIONS}
            />
            {biteHistory === 'yes' && (
              <TextAreaField
                id="behavior-bite-detail"
                label="Detalle del antecedente"
                value={biteHistoryDetail}
                onChange={setBiteHistoryDetail}
                rows={2}
              />
            )}
            <TextAreaField
              id="behavior-medical-conditions"
              label="Condiciones médicas relevantes (opcional)"
              value={medicalConditionsRelevant}
              onChange={setMedicalConditionsRelevant}
              rows={2}
              placeholder="Ej. alimento senior, sin medicación activa"
            />
            <Input
              aria-label="Nombre completo del firmante"
              value={signedByName}
              onChange={(e) => setSignedByName(e.target.value)}
              placeholder="Nombre completo del firmante"
            />
            <div className="flex gap-2">
              <Button disabled={saving} onClick={() => void submit()}>
                {saving ? 'Firmando…' : 'Firmar y continuar'}
              </Button>
              <Button variant="outline" disabled={saving} onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
