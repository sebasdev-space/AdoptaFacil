import { useState } from 'react';
import type { Animal, AnimalSex, ComputedAge } from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  ComingSoon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@adoptafacil/ui';
import { AnimalCarnetSection } from './animal-carnet-section';
import { AnimalRegistroClinicoSection } from './animal-registro-clinico-section';
import { IconButton } from './icon-button';
import { FolderIcon, HeartIcon, PawEmptyIcon, PencilIcon, TrashIcon } from './icons';
import styles from './animal-detail-panel.module.scss';

const SEX_LABELS: Record<AnimalSex, string> = {
  male: 'macho',
  female: 'hembra',
  unknown: 'sexo desconocido',
};

/** Misma derivación que `animals-page.tsx`/`animal-clinical-panel.tsx` —
 *  duplicada feature-localmente por convención del proyecto (bajo riesgo de
 *  divergencia, 6 líneas). */
function ageLabel(age?: ComputedAge): string {
  if (!age) return 'edad desconocida';
  const parts: string[] = [];
  if (age.years > 0) parts.push(`${age.years} años`);
  if (age.months > 0) parts.push(`${age.months} m`);
  const text = parts.join(' ') || '0 m';
  return age.approximate ? `~${text}` : text;
}

/** "Raza · sexo · edad" (T-ANIMALS-DETAIL): el mockup de este refactor pedía
 *  también "· peso", pero `Animal` no tiene un campo de peso — se omite en
 *  vez de inventar un dato (ver CLAUDE.md "sin datos inventados"). */
function detailSubline(animal: Animal): string {
  const parts: string[] = [];
  if (animal.breed) parts.push(animal.breed);
  parts.push(SEX_LABELS[animal.sex]);
  parts.push(ageLabel(animal.computedAge));
  return parts.join(' · ');
}

export interface AnimalDetailPanelProps {
  animal: Animal;
  canManage: boolean;
  canDelete: boolean;
  canManageSponsorship: boolean;
  onEdit: (animal: Animal) => void;
  onDelete: (animal: Animal) => void;
  onSponsor: (animal: Animal) => void;
  onReactivate: (animal: Animal) => void;
  /** Solo se usa en móvil (`lg:hidden`) para volver a la lista. */
  onBack: () => void;
}

/**
 * Panel de detalle del animal seleccionado (refactor visual maestro-detalle,
 * M03). Header con foto/nombre/raza-sexo-edad + acciones en icon-button con
 * tooltip, y 3 tabs: Carnet · Registro clínico · Documentos. Reutiliza
 * `useAnimalClinicalRecord` (vía las secciones Carnet/Registro) para no
 * duplicar los fetches ya usados por `AnimalClinicalPanel` (shell).
 */
export function AnimalDetailPanel({
  animal,
  canManage,
  canDelete,
  canManageSponsorship,
  onEdit,
  onDelete,
  onSponsor,
  onReactivate,
  onBack,
}: AnimalDetailPanelProps) {
  const [tab, setTab] = useState<'carnet' | 'registro' | 'documentos'>('carnet');
  const isInactive = animal.isActive === false;
  const photo = animal.photos[0];

  return (
    <div className={styles.detail}>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-left text-sm text-muted-foreground underline-offset-4 hover:underline lg:hidden"
      >
        ← Volver a la lista
      </button>

      <div className={styles.detail__header}>
        {photo ? (
          <img src={photo} alt={`Foto de ${animal.name}`} className={styles.detail__avatar} />
        ) : (
          <div aria-hidden className={styles['detail__avatar-fallback']}>
            <PawEmptyIcon className="h-6 w-6" />
          </div>
        )}

        <div className={styles.detail__identity}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={styles.detail__name}>{animal.name}</h2>
            {isInactive && <Badge variant="destructive">Inactivo</Badge>}
          </div>
          <p className={styles.detail__subline}>{detailSubline(animal)}</p>
          {animal.tags && animal.tags.length > 0 && (
            <div className={styles.detail__tags}>
              {animal.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className={styles.detail__actions}>
          {canManage && (
            <IconButton icon={<PencilIcon />} label="Editar" onClick={() => onEdit(animal)} />
          )}
          {canManage && (
            <IconButton
              icon={<FolderIcon />}
              label="Expediente médico"
              onClick={() => setTab('registro')}
            />
          )}
          {!isInactive && canDelete && (
            <IconButton
              icon={<TrashIcon />}
              label="Eliminar"
              variant="danger"
              onClick={() => onDelete(animal)}
            />
          )}
          {!isInactive && canManageSponsorship && (
            <IconButton
              icon={<HeartIcon />}
              label="Apadrinamiento"
              onClick={() => onSponsor(animal)}
            />
          )}
          {isInactive && canManage && (
            <Button size="sm" variant="outline" onClick={() => onReactivate(animal)}>
              Reactivar
            </Button>
          )}
        </div>
      </div>

      <div className={styles.detail__body}>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList aria-label="Secciones del expediente del animal">
            <TabsTrigger value="carnet">Carnet</TabsTrigger>
            <TabsTrigger value="registro">Registro clínico</TabsTrigger>
            <TabsTrigger value="documentos">Documentos</TabsTrigger>
          </TabsList>

          <TabsContent value="carnet">
            <AnimalCarnetSection animalId={animal.id} />
          </TabsContent>

          <TabsContent value="registro">
            <AnimalRegistroClinicoSection animalId={animal.id} />
          </TabsContent>

          <TabsContent value="documentos">
            <ComingSoon
              title="Adjuntar evidencia al expediente clínico"
              description="Próximamente podrás subir fotos, exámenes y otros documentos del animal."
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
