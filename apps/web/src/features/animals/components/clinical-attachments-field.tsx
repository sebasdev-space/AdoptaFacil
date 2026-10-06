import { DOCUMENT_ACCEPT } from '../lib/storage';

export interface ClinicalAttachmentsFieldProps {
  id: string;
  files: File[];
  onAddFile: (file: File) => void;
  onRemoveFile: (index: number) => void;
  disabled?: boolean;
}

/**
 * Selector de archivos reales para adjuntar a un evento clínico (fix,
 * T-ANIMALS-ATTACHMENTS-AUDIT) — reemplaza la caja de texto "Adjunto (nombre
 * de archivo)" que nunca subía bytes reales. Mismo patrón visual que
 * `AnimalPhotoField` (input oculto + label), pero admite VARIOS archivos en
 * cola (PDF o imágenes) antes de "Registrar" — cada uno se sube (reserve +
 * PUT) solo al enviar el formulario (`useAnimalClinicalRecord.submit`).
 */
export function ClinicalAttachmentsField({
  id,
  files,
  onAddFile,
  onRemoveFile,
  disabled,
}: ClinicalAttachmentsFieldProps) {
  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-foreground">Adjuntos (opcional)</span>
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center justify-between gap-2 rounded border border-input px-2 py-1 text-sm"
            >
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => onRemoveFile(index)}
                disabled={disabled}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      <label
        htmlFor={id}
        className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        Adjuntar archivo (PDF o imagen)
        <input
          id={id}
          type="file"
          accept={DOCUMENT_ACCEPT.join(',')}
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) onAddFile(file);
          }}
        />
      </label>
    </div>
  );
}
