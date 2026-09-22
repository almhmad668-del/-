import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { archiveProduct } from './actions'

export default async function VendorProductsPage() {
  const supabase = await createClient()

  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) return null

  // Fetch the authorized vendor (Owner or active staff)
  let vendorId: string | null = null

  const { data: vendors } = await supabase
    .from('vendors')
    .select('id')
    .eq('user_id', userData.user.id)
    .limit(1)

  if (vendors && vendors.length > 0) {
    vendorId = vendors[0].id
  } else {
    const { data: members } = await supabase
      .from('vendor_members')
      .select('vendor_id')
      .eq('user_id', userData.user.id)
      .eq('is_active', true)
      .limit(1)

    if (members && members.length > 0) {
      vendorId = members[0].vendor_id
    }
  }

  if (!vendorId) return <div className="p-8 text-red-500">No active vendor association found.</div>

  // Fetch products
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false })

  if (error) {
    return <div className="text-red-500">Error loading products: {error.message}</div>
  }

  return (
    <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Products</h2>
          <p className="mt-1 text-sm text-gray-500">Manage your store catalog.</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Link
            href="/vendor/products/new"
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            Add Product
          </Link>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
          <p className="text-gray-500">No products found. Start by adding one!</p>
        </div>
      ) : (
        <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Name</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Price</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Stock</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
                <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {products.map((product) => (
                <tr key={product.id}>
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                    {product.name}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    ${product.price}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    {product.stock_quantity}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                      product.status === 'active' ? 'bg-green-100 text-green-800' :
                      product.status === 'draft' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {product.status}
                    </span>
                  </td>
                  <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                    <Link href={`/vendor/products/${product.id}`} className="text-blue-600 hover:text-blue-900">
                      Edit
                    </Link>
                    {product.status !== 'archived' && (
                      <form action={async () => {
                        'use server'
                        await archiveProduct(product.id)
                      }} className="inline">
                        <button type="submit" className="text-red-600 hover:text-red-900 ml-4">Archive</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
