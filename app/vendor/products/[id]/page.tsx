import { createClient } from '@/utils/supabase/server'
import ProductForm from '../components/ProductForm'
import { notFound } from 'next/navigation'

export default async function EditProductPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()

  // Verify the product exists and belongs to the authorized vendor (handled by RLS automatically if logged in)
  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !product) {
    notFound()
  }

  return (
    <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
      <div className="mb-8 border-b pb-4">
        <h2 className="text-xl font-semibold text-gray-900">Edit Product</h2>
        <p className="mt-1 text-sm text-gray-500">Update your product listing details.</p>
      </div>
      <ProductForm productId={product.id} initialData={product} />
    </div>
  )
}
