import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import ProductCard from '@/components/ProductCard'

export default async function HomePage() {
  const supabase = await createClient()

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, slug')
    .eq('is_active', true)
    .order('name')
    .limit(6)

  const { data: products } = await supabase
    .from('products')
    .select(`
      id, name, slug, price, currency, main_image_url,
      vendors ( store_name )
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(8)

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
          Welcome to <span className="text-blue-600">TrendyMarket</span>
        </h1>
        <p className="mt-3 max-w-md mx-auto text-base text-gray-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
          Discover amazing products from vendors around the world.
        </p>
      </div>

      <section className="mb-16">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Popular Categories</h2>
          <Link href="/categories" className="text-sm font-semibold text-blue-600 hover:text-blue-500">
            Browse all categories &rarr;
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {categories?.map((category) => (
            <Link
              key={category.id}
              href={`/categories/${category.slug}`}
              className="group flex flex-col items-center justify-center p-6 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <span className="text-gray-900 font-medium text-center">{category.name}</span>
            </Link>
          ))}
          {(!categories || categories.length === 0) && (
            <p className="text-gray-500 col-span-full">No categories available right now.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-gray-900 mb-6">New Arrivals</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products?.map((product) => (
            <ProductCard key={product.id} product={product as any} />
          ))}
          {(!products || products.length === 0) && (
            <p className="text-gray-500 col-span-full">No products available right now.</p>
          )}
        </div>
      </section>
    </main>
  )
}
