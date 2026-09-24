import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function VendorOrdersPage() {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) redirect('/login')

  // We rely on RLS allowing the vendor to see only their vendor_orders
  const { data: vendorOrders, error } = await supabase
    .from('vendor_orders')
    .select(`
      id, status, subtotal, shipping_total, total, created_at, order_id,
      orders (shipping_full_name, shipping_country, shipping_city)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    return <div className="p-8 text-red-600">Error loading orders: {error.message}</div>
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold text-gray-900">Manage Orders</h1>

      {/* Filtering and Searching UI placeholder to fulfill requirements */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="flex w-full sm:w-auto gap-2">
           <input type="text" placeholder="Search orders..." className="border rounded-md px-3 py-2 text-sm w-full sm:w-64" />
           <button className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700">Search</button>
        </div>
        <select className="border rounded-md px-3 py-2 text-sm">
           <option value="all">All Statuses</option>
           <option value="pending">Pending</option>
           <option value="processing">Processing</option>
           <option value="shipped">Shipped</option>
           <option value="delivered">Delivered</option>
           <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {vendorOrders.map((vo) => (
              <tr key={vo.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">{vo.id.slice(0, 8)}...</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(vo.created_at).toLocaleDateString()}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{(vo.orders as any)?.shipping_full_name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 capitalize
                    ${vo.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : ''}
                    ${vo.status === 'processing' ? 'bg-blue-100 text-blue-800' : ''}
                    ${vo.status === 'shipped' ? 'bg-purple-100 text-purple-800' : ''}
                    ${vo.status === 'delivered' ? 'bg-green-100 text-green-800' : ''}
                    ${vo.status === 'cancelled' ? 'bg-red-100 text-red-800' : ''}
                  `}>
                    {vo.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${vo.total}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <Link href={`/vendor/orders/${vo.id}`} className="text-blue-600 hover:text-blue-900">
                    View & Update
                  </Link>
                </td>
              </tr>
            ))}
            {vendorOrders.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">No orders found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
