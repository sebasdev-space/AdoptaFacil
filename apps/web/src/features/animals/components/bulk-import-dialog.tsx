import { useState } from 'react';
import type { BulkImportResultDto } from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { downloadBulkImportTemplate, isXlsxFile } from '../lib/bulk-import';

export interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after an import that created at least one animal, so the caller
   *  can reload the grid. */
  onImported: () => void;
}

/**
 * Importación masiva de animales vía Excel (S2-04B-1): descargar plantilla,
 * subir archivo, ver el reporte (creados vs. errores por fila). Una fila
 * inválida nunca aborta el archivo — el reporte lista cada error con su fila,
 * campo y motivo (§restricciones "validación no bloqueante").
 */
export function BulkImportDialog({ open, onOpenChange, onImported }: BulkImportDialogProps) {
  const client = useApiClient();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<BulkImportResultDto | null>(null);

  function reset(): void {
    setFile(null);
    setResult(null);
  }

  async function handleDownloadTemplate(): Promise<void> {
    setDownloading(true);
    try {
      await downloadBulkImportTemplate(client);
    } catch (error) {
      toast({
        title: 'No se pudo descargar la plantilla',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  }

  async function handleImport(): Promise<void> {
    if (!file) return;
    if (!isXlsxFile(file)) {
      toast({
        title: 'Archivo no válido',
        description: 'Sube un archivo .xlsx.',
        variant: 'warning',
      });
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file, file.name);
      const report = await client.request<BulkImportResultDto>('/animals/bulk-import', {
        method: 'POST',
        body: form,
      });
      setResult(report);
      if (report.created > 0) {
        onImported();
      }
      if (report.failed === 0) {
        toast({ title: `${report.created} animales importados`, variant: 'success' });
      } else {
        toast({
          title: `${report.created} creados, ${report.failed} con errores`,
          description: 'Revisa el detalle por fila abajo.',
          variant: 'warning',
        });
      }
    } catch (error) {
      toast({
        title: 'No se pudo importar el archivo',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar animales desde Excel</DialogTitle>
          <DialogDescription>
            Descarga la plantilla, complétala y súbela para crear varios expedientes a la vez.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Button
            variant="outline"
            onClick={() => void handleDownloadTemplate()}
            disabled={downloading}
          >
            {downloading ? 'Descargando…' : 'Descargar plantilla (.xlsx)'}
          </Button>

          <div className="space-y-1.5">
            <label htmlFor="bulk-import-file" className="block text-sm font-medium text-foreground">
              Archivo (.xlsx)
            </label>
            <input
              id="bulk-import-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
            />
          </div>

          {uploading && (
            <p role="status" className="text-sm text-muted-foreground">
              Importando… esto puede tardar unos segundos.
            </p>
          )}

          {result && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{result.totalRows} filas</Badge>
                <Badge variant="success">{result.created} creados</Badge>
                {result.failed > 0 && (
                  <Badge variant="destructive">{result.failed} con errores</Badge>
                )}
              </div>
              {result.errors.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fila</TableHead>
                      <TableHead>Campo</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.errors.map((err, i) => (
                      <TableRow key={i}>
                        <TableCell>{err.row}</TableCell>
                        <TableCell>{err.field ?? '—'}</TableCell>
                        <TableCell>{err.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button onClick={() => void handleImport()} disabled={!file || uploading}>
            {uploading ? 'Importando…' : 'Importar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
