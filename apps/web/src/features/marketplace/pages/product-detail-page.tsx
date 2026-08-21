import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  PRODUCT_CATEGORIES,
  ProductCategory,
  type Product,
  type ProductImageUploadResult,
  type UpdateProductInput,
  Role,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { SelectField, TextAreaField } from '../components/product-form-fields';
import { CATEGORY_LABELS, formatCop } from '../model/marketplace-view';
import { IMAGE_ACCEPT, uploadImageFile, validateImageUpload } from '../lib/storage';

const CATEGORY_OPTIONS = PRODUCT_CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}));

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

/**
 * `/organizacion/marketplace/:id` (M10, F-7) — detalle interno de un
 * producto: editar sus datos (incl. activar/desactivar) y gestionar sus
 * fotos. Editar producto y fotos: Owner/Administrator/Operator; ver: +
 * ReadOnlyAuditor.
 */
export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const client = useApiClient();
  const { hasRole } = useSession();
  const canManage = hasRole(Role.Owner) || hasRole(Role.Administrator) || hasRole(Role.Operator);
  const { toast } = useToast();

  const [state, setState] = useState<LoadState>('loading');
  const [product, setProduct] = useState<Product | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ProductCategory>(ProductCategory.Food);
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [saving, setSaving] = useState(false);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const applyProduct = (found: Product): void => {
    setProduct(found);
    setName(found.name);
    setDescription(found.description ?? '');
    setCategory(found.category);
    setPrice(String(found.price));
    setStock(String(found.stock));
  };

  const load = async (): Promise<void> => {
    if (!id) return;
    const found = await client.request<Product>(`/marketplace/products/${encodeURIComponent(id)}`);
    applyProduct(found);
  };

  useEffect(() => {
    if (!id) {
      setState('not-found');
      return;
    }
    let active = true;
    void (async () => {
      try {
        const found = await client.request<Product>(
          `/marketplace/products/${encodeURIComponent(id)}`,
        );
        if (active) {
          applyProduct(found);
          setState('ready');
        }
      } catch {
        if (active) setState('error');
      }
    })();
    return () => {
      active = false;
    };
  }, [client, id]);

  const submit = async (): Promise<void> => {
    if (!id) return;
    const priceValue = Number(price);
    const stockValue = Number(stock);
    if (
      !name.trim() ||
      !Number.isInteger(priceValue) ||
      priceValue <= 0 ||
      !Number.isInteger(stockValue) ||
      stockValue < 0
    ) {
      toast({
        title: 'Datos incompletos',
        description: 'Nombre obligatorio; precio entero COP > 0; stock entero >= 0.',
        variant: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      const body: UpdateProductInput = {
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        price: priceValue,
        stock: stockValue,
      };
      const updated = await client.request<Product>(
        `/marketplace/products/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          json: body,
        },
      );
      setProduct(updated);
      toast({ title: 'Producto actualizado', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo actualizar el producto',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (): Promise<void> => {
    if (!id || !product) return;
    try {
      const updated = await client.request<Product>(
        `/marketplace/products/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          json: { isActive: !product.isActive },
        },
      );
      setProduct(updated);
      toast({
        title: updated.isActive ? 'Producto activado' : 'Producto desactivado',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'No se pudo cambiar el estado',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  const submitImage = async (): Promise<void> => {
    if (!id || !imageFile) return;
    const invalid = validateImageUpload(imageFile);
    if (invalid) {
      toast({ title: 'Archivo no válido', description: invalid, variant: 'warning' });
      return;
    }
    setUploadingImage(true);
    try {
      const result = await client.request<ProductImageUploadResult>(
        `/marketplace/products/${encodeURIComponent(id)}/images`,
        {
          method: 'POST',
          json: { filename: imageFile.name, contentType: imageFile.type || undefined },
        },
      );
      await uploadImageFile(client, result.upload.key, imageFile);
      setImageFile(null);
      await load();
      toast({ title: 'Foto agregada', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo agregar la foto',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = async (imageId: string): Promise<void> => {
    if (!id) return;
    try {
      await client.request(
        `/marketplace/products/${encodeURIComponent(id)}/images/${encodeURIComponent(imageId)}`,
        { method: 'DELETE' },
      );
      await load();
      toast({ title: 'Foto eliminada', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo eliminar la foto',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Detalle de producto"
        description="Edita el producto, activa/desactívalo y gestiona sus fotos."
      />
      <Link
        to="/organizacion/marketplace"
        className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Volver al marketplace
      </Link>

      {state === 'loading' && <Skeleton className="h-64 w-full" />}
      {state === 'not-found' && (
        <EmptyState
          title="Producto no especificado"
          description="Falta el identificador del producto."
        />
      )}
      {state === 'error' && (
        <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
      )}

      {state === 'ready' && product && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {product.name}
                <Badge variant="secondary">{CATEGORY_LABELS[product.category]}</Badge>
                <Badge variant={product.isActive ? 'success' : 'destructive'}>
                  {product.isActive ? 'Activo' : 'Inactivo'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-lg font-semibold">{formatCop(product.price)}</p>
              {canManage && (
                <Button variant="outline" size="sm" onClick={() => void toggleActive()}>
                  {product.isActive ? 'Desactivar' : 'Activar'}
                </Button>
              )}
            </CardContent>
          </Card>

          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Editar producto</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="product-edit-name"
                    className="block text-sm font-medium text-foreground"
                  >
                    Nombre
                  </label>
                  <Input
                    id="product-edit-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <TextAreaField
                  id="product-edit-description"
                  label="Descripción"
                  value={description}
                  onChange={setDescription}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    id="product-edit-category"
                    label="Categoría"
                    value={category}
                    onChange={setCategory}
                    options={CATEGORY_OPTIONS}
                  />
                  <div className="space-y-1.5">
                    <label
                      htmlFor="product-edit-price"
                      className="block text-sm font-medium text-foreground"
                    >
                      Precio (COP)
                    </label>
                    <Input
                      id="product-edit-price"
                      type="number"
                      min={1}
                      step={1}
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="product-edit-stock"
                    className="block text-sm font-medium text-foreground"
                  >
                    Stock
                  </label>
                  <Input
                    id="product-edit-stock"
                    type="number"
                    min={0}
                    step={1}
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                  />
                </div>
                <Button disabled={saving} onClick={() => void submit()}>
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Fotos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {canManage && (
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    id="product-image-file"
                    type="file"
                    accept={IMAGE_ACCEPT.join(',')}
                    onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                    className="block text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
                  />
                  <Button
                    size="sm"
                    disabled={!imageFile || uploadingImage}
                    onClick={() => void submitImage()}
                  >
                    {uploadingImage ? 'Subiendo…' : 'Agregar foto'}
                  </Button>
                </div>
              )}
              {product.images.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no hay fotos de este producto.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  {product.images.map((image) => (
                    <div key={image.id} className="space-y-2">
                      <img
                        src={image.url}
                        alt={product.name}
                        className="aspect-square w-full rounded-md border object-cover"
                      />
                      {canManage && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => void removeImage(image.id)}
                        >
                          Eliminar
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}
