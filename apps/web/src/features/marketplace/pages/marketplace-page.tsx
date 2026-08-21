import { useEffect, useState } from 'react';
import {
  type CreateProductInput,
  PRODUCT_CATEGORIES,
  ProductCategory,
  type Product,
  type ProductsPage as ProductsPageDto,
  Role,
} from '@adoptafacil/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { SelectField, TextAreaField } from '../components/product-form-fields';
import { ProductManageCard } from '../components/product-manage-card';
import { CATEGORY_LABELS } from '../model/marketplace-view';

const CATEGORY_OPTIONS = PRODUCT_CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}));

/**
 * `/organizacion/marketplace` (M10, F-7) — gestión del catálogo de productos
 * de la organización, usando SOLO endpoints ya existentes (`GET`/`POST
 * /marketplace/products`). Crear/editar: Owner/Administrator/Operator; ver:
 * + ReadOnlyAuditor (calcado de `MarketplaceProductsController`'s @Roles).
 */
export function MarketplacePage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canManage = hasRole(Role.Owner) || hasRole(Role.Administrator) || hasRole(Role.Operator);
  const { toast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ProductCategory>(ProductCategory.Food);
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [saving, setSaving] = useState(false);

  // ⚠️ Blindaje anti-regresión (patrón de public-campaigns.ts): SIEMPRE se
  // normaliza `.items` a `[]` si la respuesta no trae un array.
  const load = async (): Promise<void> => {
    const page = await client.request<Partial<ProductsPageDto>>(
      '/marketplace/products?limit=50&includeInactive=true',
    );
    setProducts(Array.isArray(page?.items) ? page.items : []);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const page = await client.request<Partial<ProductsPageDto>>(
          '/marketplace/products?limit=50&includeInactive=true',
        );
        if (active) setProducts(Array.isArray(page?.items) ? page.items : []);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client]);

  const resetForm = (): void => {
    setName('');
    setDescription('');
    setCategory(ProductCategory.Food);
    setPrice('');
    setStock('');
  };

  const submit = async (): Promise<void> => {
    const priceValue = Number(price);
    const stockValue = stock.trim() ? Number(stock) : undefined;
    if (
      !name.trim() ||
      !Number.isInteger(priceValue) ||
      priceValue <= 0 ||
      (stockValue !== undefined && (!Number.isInteger(stockValue) || stockValue < 0))
    ) {
      toast({
        title: 'Datos incompletos',
        description:
          'Nombre, categoría y precio (entero COP > 0) son obligatorios; el stock no puede ser negativo.',
        variant: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      const body: CreateProductInput = {
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        category,
        price: priceValue,
        ...(stockValue !== undefined ? { stock: stockValue } : {}),
      };
      await client.request<Product>('/marketplace/products', { method: 'POST', json: body });
      resetForm();
      setShowForm(false);
      await load();
      toast({ title: 'Producto publicado', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo publicar el producto',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Marketplace"
        description="Publica productos físicos de tu organización. El contacto y la venta ocurren por WhatsApp, fuera de la plataforma."
        actions={canManage && <Button onClick={() => setShowForm(true)}>Publicar producto</Button>}
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && (
        <div className="space-y-6">
          {products.length === 0 ? (
            <EmptyState
              icon={<span aria-hidden>🛍️</span>}
              title="Aún no hay productos publicados"
              description={
                canManage ? 'Publica tu primer producto para empezar a vender.' : undefined
              }
              action={
                canManage ? (
                  <Button onClick={() => setShowForm(true)}>Publicar tu primer producto</Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => (
                <ProductManageCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={canManage && showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo producto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="product-name" className="block text-sm font-medium text-foreground">
                Nombre
              </label>
              <Input
                id="product-name"
                placeholder="Nombre del producto"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <TextAreaField
              id="product-description"
              label="Descripción"
              value={description}
              onChange={setDescription}
              placeholder="Cuéntale al comprador de qué se trata…"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                id="product-category"
                label="Categoría"
                value={category}
                onChange={setCategory}
                options={CATEGORY_OPTIONS}
              />
              <div className="space-y-1.5">
                <label
                  htmlFor="product-price"
                  className="block text-sm font-medium text-foreground"
                >
                  Precio (COP)
                </label>
                <Input
                  id="product-price"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="Precio en pesos"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="product-stock" className="block text-sm font-medium text-foreground">
                Stock (opcional, 0 por defecto)
              </label>
              <Input
                id="product-stock"
                type="number"
                min={0}
                step={1}
                placeholder="Unidades disponibles"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button disabled={saving} onClick={() => void submit()}>
              {saving ? 'Publicando…' : 'Publicar producto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
