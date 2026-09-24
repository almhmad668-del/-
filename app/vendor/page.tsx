import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'

export default async function VendorDashboardPage() {
  const supabase = await createClient()

  // Find the vendor ID first
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) return null

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

  let totalProducts = 0
  let activeProducts = 0
  let draftProducts = 0

  if (vendorId) {
    const { data: products } = await supabase
      .from('products')
      .select('status')
      .eq('vendor_id', vendorId)

    if (products) {
      totalProducts = products.length
      activeProducts = products.filter(p => p.status === 'active').length
      draftProducts = products.filter(p => p.status === 'draft').length
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-xl font-semibold mb-4">Welcome to your store</h2>
        <p className="text-gray-600">
          Manage your store catalog and settings. Orders and payments will be available in future updates.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6 border border-gray-200">
          <dt className="truncate text-sm font-medium text-gray-500">Total Products</dt>
          <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">{totalProducts}</dd>
        </div>
        <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6 border border-gray-200">
          <dt className="truncate text-sm font-medium text-gray-500">Active Listings</dt>
          <dd className="mt-1 text-3xl font-semibold tracking-tight text-green-600">{activeProducts}</dd>
        </div>
        <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6 border border-gray-200">
          <dt className="truncate text-sm font-medium text-gray-500">Drafts</dt>
          <dd className="mt-1 text-3xl font-semibold tracking-tight text-yellow-600">{draftProducts}</dd>
        </div>
      </div>

      <div className="mt-6">
        <Link
          href="/vendor/products"
          className="text-blue-600 hover:text-blue-800 font-medium"
        >
          View all products &rarr;
        </Link>
      </div>
    </div>
  )
}
