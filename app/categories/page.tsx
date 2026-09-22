import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'

export default async function CategoriesPage() {
  const supabase = await createClient()

  // Fetch all active root categories with their active subcategories
  const { data: rootCategories } = await supabase
    .from('categories')
    .select('id, name, slug, description')
    .eq('is_active', true)
    .is('parent_id', null)
    .order('name')

  // We could do a complex join, but for simplicity we can just fetch all subcategories
  const { data: subCategories } = await supabase
    .from('categories')
    .select('id, parent_id, name, slug')
    .eq('is_active', true)
    .not('parent_id', 'is', null)
    .order('name')

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-8">All Categories</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {rootCategories?.map((category) => {
          const children = subCategories?.filter((sub) => sub.parent_id === category.id) || []

          return (
            <div key={category.id} className="border rounded-lg p-6 bg-white shadow-sm flex flex-col h-full">
              <div className="flex-1">
                <Link href={`/categories/${category.slug}`}>
                  <h2 className="text-xl font-bold text-gray-900 hover:text-blue-600 transition-colors mb-2">
                    {category.name}
                  </h2>
                </Link>
                {category.description && (
                  <p className="text-gray-500 text-sm mb-4 line-clamp-2">{category.description}</p>
                )}

                {children.length > 0 && (
                  <ul className="space-y-2 mt-4">
                    {children.slice(0, 5).map((child) => (
                      <li key={child.id}>
                        <Link
                          href={`/categories/${child.slug}`}
                          className="text-gray-600 hover:text-blue-500 text-sm"
                        >
                          {child.name}
                        </Link>
                      </li>
                    ))}
                    {children.length > 5 && (
                      <li>
                        <Link
                          href={`/categories/${category.slug}`}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          View all {children.length} subcategories &rarr;
                        </Link>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          )
        })}
        {(!rootCategories || rootCategories.length === 0) && (
          <p className="text-gray-500 col-span-full">No categories available.</p>
        )}
      </div>
    </main>
  )
}
