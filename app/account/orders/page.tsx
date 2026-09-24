import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function OrderHistoryPage() {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) redirect('/login')

  const { data: orders } = await supabase
    .from('orders')
    .select(`
      id, created_at, status, payment_status, total,
      vendor_orders (id, status, vendor_id, vendors(store_name), order_items(vendor_name_snapshot)),
      order_items (id)
    `)
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="bg-white shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-6">Order History</h3>

        {(!orders || orders.length === 0) ? (
          <p className="text-gray-500">You haven't placed any orders yet.</p>
        ) : (
          <div className="space-y-6">
            {orders.map((order: any) => (
              <div key={order.id} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 sm:px-6 flex items-center justify-between border-b border-gray-200">
                  <div className="flex flex-col sm:flex-row sm:space-x-8">
                    <div>
                      <span className="block text-xs font-medium text-gray-500 uppercase">Order Placed</span>
                      <span className="block text-sm text-gray-900">{new Date(order.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="mt-2 sm:mt-0">
                      <span className="block text-xs font-medium text-gray-500 uppercase">Total</span>
                      <span className="block text-sm text-gray-900">${order.total}</span>
                    </div>
                    <div className="mt-2 sm:mt-0">
                      <span className="block text-xs font-medium text-gray-500 uppercase">Order ID</span>
                      <span className="block text-sm text-gray-900 font-mono">{order.id.slice(0, 8)}...</span>
                    </div>
                    <div className="mt-2 sm:mt-0">
                      <span className="block text-xs font-medium text-gray-500 uppercase">Payment Status</span>
                      <span className={`block text-sm font-medium capitalize
                        ${order.payment_status === 'paid' ? 'text-green-600' : ''}
                        ${order.payment_status === 'pending' ? 'text-yellow-600' : ''}
                        ${order.payment_status === 'failed' || order.payment_status === 'refunded' ? 'text-red-600' : ''}
                      `}>
                        {order.payment_status}
                      </span>
                    </div>
                  </div>
                  <div>
                    <Link href={`/account/orders/${order.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-500">
                      View Details
                    </Link>
                  </div>
                </div>
                <div className="p-4 sm:p-6 bg-white">
                  <p className="text-sm text-gray-900 font-medium mb-4">
                    Status: <span className="capitalize">{order.status}</span>
                  </p>
                  <div className="space-y-2">
                    {order.vendor_orders.map((vo: any) => {
                      // Fallback to vendors(store_name) if snapshot is missing, but prioritize the snapshot from the first item
                      const snapshotName = vo.order_items?.[0]?.vendor_name_snapshot;
                      return (
                        <div key={vo.id} className="flex justify-between items-center text-sm border-t pt-2">
                          <span className="text-gray-700">{snapshotName || vo.vendors?.store_name}</span>
                          <span className="text-gray-500 capitalize">{vo.status}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
