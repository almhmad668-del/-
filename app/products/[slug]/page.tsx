import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import VariantSelector from './VariantSelector'
import Link from 'next/link'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const resolvedParams = await params
  const supabase = await createClient()

  // We must enforce the exact same visibility rules as the page
  const { data: product } = await supabase
    .from('products')
    .select('name, description')
    .eq('public_slug', resolvedParams.slug)
    .single()

  if (!product) return { title: 'Product Not Found' }

  return {
    title: `${product.name} | TrendyMarket`,
    description: product.description || `Buy ${product.name} on TrendyMarket`,
  }
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params
  const supabase = await createClient()

  // 1. Fetch Product (RLS enforces status='active' AND vendor status='approved')
  const { data: product, error } = await supabase
    .from('products')
    .select(`
      id, name, description, price, currency, main_image_url,
      category_id,
      vendors ( store_name )
    `)
    .eq('public_slug', resolvedParams.slug)
    .single()

  if (error || !product) {
    notFound()
  }

  // 2. Enforce Category Rule (if product has a category, it must be active)
  if (product.category_id) {
    const { data: category } = await supabase
      .from('categories')
      .select('is_active')
      .eq('id', product.category_id)
      .single()

    if (!category || !category.is_active) {
      notFound()
    }
  }

  // 3. Fetch Options (RLS limits to active products, which we already verified)
  const { data: options } = await supabase
    .from('product_options')
    .select(`
      id, name,
      values:product_option_values(id, value)
    `)
    .eq('product_id', product.id)
    .order('created_at')

  // 4. Fetch Variants
  const { data: variants } = await supabase
    .from('product_variants')
    .select(`
      id, price, compare_at_price, stock_quantity, image_url,
      values:product_variant_values(option_value_id)
    `)
    .eq('product_id', product.id)
    .eq('is_active', true)

  const formattedVariants = variants?.map((v: any) => ({
    id: v.id,
    price: v.price !== null ? v.price : product.price,
    compare_at_price: v.compare_at_price,
    stock_quantity: v.stock_quantity,
    image_url: v.image_url || product.main_image_url,
    valueIds: v.values?.map((val: any) => val.option_value_id) || []
  })) || []

  // Ensure options are well structured
  const formattedOptions = options?.map((opt: any) => ({
    id: opt.id,
    name: opt.name,
    values: opt.values || []
  })) || []

  // Default display values before JS loads / if no variants
  const defaultPrice = product.price
  const hasVariants = formattedVariants.length > 0

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="lg:grid lg:grid-cols-2 lg:gap-x-8 xl:gap-x-16">

        {/* Image Gallery (Simplified) */}
        <div className="flex flex-col-reverse">
          <div className="w-full aspect-w-1 aspect-h-1 mt-6">
            {product.main_image_url ? (
              <img
                src={product.main_image_url}
                alt={product.name}
                className="w-full h-full object-center object-cover sm:rounded-lg"
              />
            ) : (
              <div className="w-full h-96 bg-gray-200 flex items-center justify-center sm:rounded-lg text-gray-500">
                No Image Available
              </div>
            )}
          </div>
        </div>

        {/* Product Info */}
        <div className="mt-10 px-4 sm:px-0 sm:mt-16 lg:mt-0">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">{product.name}</h1>
          <div className="mt-3">
            <h2 className="sr-only">Product information</h2>
            <p className="text-sm text-gray-500">Sold by {(product.vendors as any)?.store_name}</p>
          </div>

          <div className="mt-6">
            <h3 className="sr-only">Description</h3>
            <div className="text-base text-gray-700 space-y-6">
              <p>{product.description}</p>
            </div>
          </div>

          <div className="mt-8 border-t border-gray-200 pt-8">
            <VariantSelector
              options={formattedOptions}
              variants={formattedVariants}
              basePrice={defaultPrice}
              currency={product.currency}
            />
          </div>

        </div>
      </div>
    </main>
  )
}
