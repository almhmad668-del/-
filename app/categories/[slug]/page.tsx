import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import ProductCard from '@/components/ProductCard'
import Link from 'next/link'

export default async function CategorySlugPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string; sort?: string; search?: string }>
}) {
  const resolvedParams = await params
  const resolvedSearchParams = await searchParams

  const supabase = await createClient()

  const { data: category } = await supabase
    .from('categories')
    .select('id, name, description, parent_id')
    .eq('slug', resolvedParams.slug)
    .eq('is_active', true)
    .single()

  if (!category) {
    notFound()
  }

  // Find subcategories for navigation
  const { data: subCategories } = await supabase
    .from('categories')
    .select('id, name, slug')
    .eq('parent_id', category.id)
    .eq('is_active', true)
    .order('name')

  // Parse parameters
  let page = parseInt(resolvedSearchParams.page || '1')
  if (isNaN(page)) page = 1
  const pageSize = 12
  const sort = resolvedSearchParams.sort || 'newest'
  const search = resolvedSearchParams.search || ''

  // Build query
  let query = supabase
    .from('products')
    .select(`
      id, name, slug, price, currency, main_image_url,
      vendors ( store_name )
    `, { count: 'exact' })
    .eq('is_active', true)

  // If it's a parent category, we might want products in it OR its subcategories.
  // For simplicity, let's just get products exactly in this category for now,
  // or use an in filter if we fetch subcategory IDs.
  if (subCategories && subCategories.length > 0) {
    const categoryIds = [category.id, ...subCategories.map(c => c.id)]
    query = query.in('category_id', categoryIds)
  } else {
    query = query.eq('category_id', category.id)
  }

  if (search) {
    query = query.ilike('name', `%${search}%`)
  }

  switch (sort) {
    case 'price_asc':
      query = query.order('price', { ascending: true })
      break
    case 'price_desc':
      query = query.order('price', { ascending: false })
      break
    case 'newest':
    default:
      query = query.order('created_at', { ascending: false })
      break
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data: products, count } = await query.range(from, to)

  const totalPages = count ? Math.ceil(count / pageSize) : 0

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <nav className="text-sm font-medium text-gray-500 mb-4">
          <Link href="/categories" className="hover:text-gray-900">Categories</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{category.name}</span>
        </nav>

        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">{category.name}</h1>
        {category.description && (
          <p className="mt-2 text-gray-600 max-w-3xl">{category.description}</p>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar */}
        <div className="w-full lg:w-64 flex-shrink-0">
          {subCategories && subCategories.length > 0 && (
            <div className="mb-8">
              <h3 className="font-semibold text-gray-900 mb-4">Subcategories</h3>
              <ul className="space-y-2">
                {subCategories.map(sub => (
                  <li key={sub.id}>
                    <Link href={`/categories/${sub.slug}`} className="text-gray-600 hover:text-blue-600 text-sm">
                      {sub.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h3 className="font-semibold text-gray-900 mb-4">Sort By</h3>
            <form className="space-y-2" method="GET">
              {search && <input type="hidden" name="search" value={search} />}
              <select
                name="sort"
                defaultValue={sort}
                onChange={(e) => e.target.form?.submit()}
                className="block w-full border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="newest">Newest Arrivals</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
              </select>
            </form>
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1">
          {products && products.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {products.map(product => (
                  <ProductCard key={product.id} product={product as any} />
                ))}
              </div>

              {/* Pagination (Simplified) */}
              {totalPages > 1 && (
                <div className="mt-8 flex justify-center space-x-2">
                  {page > 1 && (
                    <Link
                      href={`/categories/${resolvedParams.slug}?page=${page - 1}&sort=${sort}${search ? `&search=${search}` : ''}`}
                      className="px-4 py-2 border rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      Previous
                    </Link>
                  )}
                  <span className="px-4 py-2 text-sm font-medium text-gray-700">
                    Page {page} of {totalPages}
                  </span>
                  {page < totalPages && (
                    <Link
                      href={`/categories/${resolvedParams.slug}?page=${page + 1}&sort=${sort}${search ? `&search=${search}` : ''}`}
                      className="px-4 py-2 border rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      Next
                    </Link>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <p className="text-gray-500">No products found in this category.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
