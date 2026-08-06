import { PHOTO_ACCEPT } from '../lib/storage';
import { CameraIcon } from './icons';

export interface AnimalPhotoFieldProps {
  id: string;
  /** Resolved preview URL — a `blob:` object URL (create) or the uploaded
   *  photo's public URL (edit). `null` when there's no photo yet. */
  preview: string | null;
  uploading?: boolean;
  onFileSelected: (file: File) => void;
}

/**
 * Foto principal — mirrors `org-profile-form.tsx`'s `ImageUploadField` (S2-REORG):
 * no URL text field, immediate preview, label toggles Subir/Cambiar. The actual
 * upload strategy differs by caller: on CREATE there's no animal id yet, so the
 * parent just keeps the `File` and defers the real upload to submit-time (same
 * as this page always did); on EDIT the parent can upload immediately via the
 * existing `POST /animals/:id/photos`. This component only renders the field.
 */
export function AnimalPhotoField({
  id,
  preview,
  uploading,
  onFileSelected,
}: AnimalPhotoFieldProps) {
  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-foreground">Foto principal</span>
      <div className="flex items-center gap-4">
        {preview ? (
          <img
            src={preview}
            alt="Vista previa de la foto principal"
            className="h-20 w-20 shrink-0 rounded-md border border-border object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted text-muted-foreground"
          >
            <CameraIcon className="h-6 w-6" />
          </div>
        )}
        <label
          htmlFor={id}
          className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          {uploading ? 'Subiendo…' : preview ? 'Cambiar foto' : 'Subir foto'}
          <input
            id={id}
            type="file"
            accept={PHOTO_ACCEPT.join(',')}
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onFileSelected(file);
            }}
          />
        </label>
      </div>
    </div>
  );
}
