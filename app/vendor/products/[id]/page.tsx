import { createClient } from '@/utils/supabase/server'
import ProductForm from '../components/ProductForm'
import VariantManager from '../components/VariantManager'
import { notFound } from 'next/navigation'

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const supabase = await createClient()

  // Verify the product exists and belongs to the authorized vendor (handled by RLS automatically if logged in)
  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', resolvedParams.id)
    .single()

  if (error || !product) {
    notFound()
  }

  // Fetch Options & Values
  const { data: options } = await supabase
    .from('product_options')
    .select(`
      id, name,
      values:product_option_values(id, value)
    `)
    .eq('product_id', product.id)
    .order('created_at')

  // Fetch Variants
  const { data: variants } = await supabase
    .from('product_variants')
    .select(`
      id, sku, price, stock_quantity, is_active,
      values:product_variant_values(
        option_value:product_option_values(id, value)
      )
    `)
    .eq('product_id', product.id)
    .order('created_at')

  // Flatten variant values for the component
  const formattedVariants = variants?.map((v: any) => ({
    ...v,
    values: v.values?.map((vv: any) => vv.option_value).filter(Boolean)
  })) || []

  return (
    <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
      <div className="mb-8 border-b pb-4">
        <h2 className="text-xl font-semibold text-gray-900">Edit Product</h2>
        <p className="mt-1 text-sm text-gray-500">Update your product listing details.</p>
      </div>
      <ProductForm productId={product.id} initialData={product} />

      <VariantManager
        productId={product.id}
        options={options || []}
        variants={formattedVariants}
      />
    </div>
  )
}
