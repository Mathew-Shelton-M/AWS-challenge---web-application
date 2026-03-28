import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchProduct, createProduct, updateProduct, type ProductFormData } from '../api/products';
import { fetchCategories } from '../api/categories';

const productSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  categoryId: z.string().min(1, 'Category is required'),
  quantity: z.coerce.number({ invalid_type_error: 'Quantity is required' }).int().min(0, 'Quantity must be 0 or more'),
  minimumThreshold: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(0, 'Must be 0 or more').optional()
  ),
  expiryDate: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().optional()
  ),
  rack: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  shelf: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  section: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
});

type FormValues = z.infer<typeof productSchema>;

export default function ProductFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: { quantity: 0 },
  });

  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  });

  const { data: existingProduct, isLoading: productLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => fetchProduct(id!),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existingProduct) {
      reset({
        name: existingProduct.name,
        categoryId: existingProduct.categoryId,
        quantity: existingProduct.quantity,
        minimumThreshold: existingProduct.minimumThreshold ?? undefined,
        expiryDate: existingProduct.expiryDate ? existingProduct.expiryDate.slice(0, 10) : '',
        rack: existingProduct.rack ?? '',
        shelf: existingProduct.shelf ?? '',
        section: existingProduct.section ?? '',
      });
    }
  }, [existingProduct, reset]);

  const mutation = useMutation({
    mutationFn: (data: ProductFormData) =>
      isEdit ? updateProduct(id!, data) : createProduct(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      if (isEdit) {
        queryClient.invalidateQueries({ queryKey: ['product', id] });
      }
      navigate('/products');
    },
  });

  const onSubmit = (values: FormValues) => {
    const payload: ProductFormData = {
      name: values.name,
      categoryId: values.categoryId,
      quantity: values.quantity,
      ...(values.minimumThreshold !== undefined ? { minimumThreshold: values.minimumThreshold } : {}),
      ...(values.expiryDate ? { expiryDate: values.expiryDate } : {}),
      ...(values.rack ? { rack: values.rack } : {}),
      ...(values.shelf ? { shelf: values.shelf } : {}),
      ...(values.section ? { section: values.section } : {}),
    };
    mutation.mutate(payload);
  };

  const getApiError = () => {
    if (!mutation.error) return null;
    const err = mutation.error as Error & { status?: number };
    if (err.status && err.status >= 400 && err.status < 500) return err.message;
    return null;
  };

  const apiError = getApiError();

  if (isEdit && productLoading) {
    return <div style={styles.centered}>Loading product...</div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>{isEdit ? 'Edit Product' : 'New Product'}</h1>

        <form onSubmit={handleSubmit(onSubmit)} noValidate style={styles.form}>
          {/* Name */}
          <div style={styles.field}>
            <label htmlFor="name" style={styles.label}>Name <span style={styles.required}>*</span></label>
            <input
              id="name"
              type="text"
              style={{ ...styles.input, ...(errors.name ? styles.inputError : {}) }}
              {...register('name')}
            />
            {errors.name && <span style={styles.fieldError}>{errors.name.message}</span>}
          </div>

          {/* Category */}
          <div style={styles.field}>
            <label htmlFor="categoryId" style={styles.label}>Category <span style={styles.required}>*</span></label>
            <select
              id="categoryId"
              style={{ ...styles.input, ...(errors.categoryId ? styles.inputError : {}) }}
              disabled={categoriesLoading}
              {...register('categoryId')}
            >
              <option value="">Select a category...</option>
              {categories?.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            {errors.categoryId && <span style={styles.fieldError}>{errors.categoryId.message}</span>}
          </div>

          {/* Quantity */}
          <div style={styles.field}>
            <label htmlFor="quantity" style={styles.label}>Quantity <span style={styles.required}>*</span></label>
            <input
              id="quantity"
              type="number"
              min={0}
              style={{ ...styles.input, ...(errors.quantity ? styles.inputError : {}) }}
              {...register('quantity')}
            />
            {errors.quantity && <span style={styles.fieldError}>{errors.quantity.message}</span>}
          </div>

          {/* Minimum Threshold */}
          <div style={styles.field}>
            <label htmlFor="minimumThreshold" style={styles.label}>Minimum Threshold</label>
            <input
              id="minimumThreshold"
              type="number"
              min={0}
              placeholder="Optional"
              style={{ ...styles.input, ...(errors.minimumThreshold ? styles.inputError : {}) }}
              {...register('minimumThreshold')}
            />
            {errors.minimumThreshold && <span style={styles.fieldError}>{errors.minimumThreshold.message}</span>}
          </div>

          {/* Expiry Date */}
          <div style={styles.field}>
            <label htmlFor="expiryDate" style={styles.label}>Expiry Date</label>
            <input
              id="expiryDate"
              type="date"
              style={{ ...styles.input, ...(errors.expiryDate ? styles.inputError : {}) }}
              {...register('expiryDate')}
            />
            {errors.expiryDate && <span style={styles.fieldError}>{errors.expiryDate.message}</span>}
          </div>

          {/* Location fields */}
          <div style={styles.sectionLabel}>Location (optional)</div>
          <div style={styles.locationRow}>
            <div style={styles.field}>
              <label htmlFor="rack" style={styles.label}>Rack</label>
              <input
                id="rack"
                type="text"
                placeholder="e.g. A"
                style={styles.input}
                {...register('rack')}
              />
            </div>
            <div style={styles.field}>
              <label htmlFor="shelf" style={styles.label}>Shelf</label>
              <input
                id="shelf"
                type="text"
                placeholder="e.g. 2"
                style={styles.input}
                {...register('shelf')}
              />
            </div>
            <div style={styles.field}>
              <label htmlFor="section" style={styles.label}>Section</label>
              <input
                id="section"
                type="text"
                placeholder="e.g. Top"
                style={styles.input}
                {...register('section')}
              />
            </div>
          </div>

          {apiError && (
            <div style={styles.apiError} role="alert">{apiError}</div>
          )}

          <div style={styles.buttonRow}>
            <button
              type="button"
              onClick={() => navigate('/products')}
              style={styles.cancelButton}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              style={{ ...styles.submitButton, ...(mutation.isPending ? styles.buttonDisabled : {}) }}
            >
              {mutation.isPending
                ? (isEdit ? 'Updating...' : 'Creating...')
                : (isEdit ? 'Update Product' : 'Create Product')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    padding: '32px 16px',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    padding: '40px',
    maxWidth: '600px',
    margin: '0 auto',
  },
  title: {
    margin: '0 0 28px',
    fontSize: '22px',
    fontWeight: 700,
    color: '#111',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
  },
  label: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#333',
  },
  required: {
    color: '#e53e3e',
  },
  input: {
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #ccc',
    borderRadius: '6px',
    outline: 'none',
    color: '#111',
    backgroundColor: '#fff',
    width: '100%',
    boxSizing: 'border-box',
  },
  inputError: {
    borderColor: '#e53e3e',
  },
  fieldError: {
    fontSize: '12px',
    color: '#e53e3e',
  },
  sectionLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginTop: '4px',
  },
  locationRow: {
    display: 'flex',
    gap: '12px',
  },
  apiError: {
    padding: '10px 12px',
    backgroundColor: '#fff5f5',
    border: '1px solid #fed7d7',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#c53030',
  },
  buttonRow: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '8px',
  },
  cancelButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#374151',
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  submitButton: {
    padding: '10px 24px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#2563eb',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  buttonDisabled: {
    backgroundColor: '#93c5fd',
    cursor: 'not-allowed',
  },
  centered: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '200px',
    fontSize: '15px',
    color: '#555',
  },
};
