import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'

export default async function OrderDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) redirect('/login')

  const { data: order, error } = await supabase
    .from('orders')
    .select(`
      *,
      vendor_orders (
        id, status, subtotal, shipping_total, discount_total, total,
        vendors (store_name),
        order_items (
          id, quantity, unit_price, line_subtotal,
          product_name_snapshot, vendor_name_snapshot, variant_name_snapshot, sku_snapshot
        )
      )
    `)
    .eq('id', resolvedParams.id)
    .single()

  // RLS protects reading another user's order
  if (error || !order) {
    notFound()
  }

  return (
    <div className="bg-white shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Order Details</h3>
          <Link href="/account/orders" className="text-sm font-medium text-blue-600 hover:text-blue-500">
            &larr; Back to Orders
          </Link>
        </div>

        <div className="border-t border-b border-gray-200 py-6 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-2">Order Information</h4>
              <dl className="text-sm text-gray-500 space-y-1">
                <div className="flex justify-between sm:justify-start sm:space-x-4">
                  <dt>Order ID:</dt>
                  <dd className="font-mono">{order.id}</dd>
                </div>
                <div className="flex justify-between sm:justify-start sm:space-x-4">
                  <dt>Date Placed:</dt>
                  <dd>{new Date(order.created_at).toLocaleDateString()}</dd>
                </div>
                <div className="flex justify-between sm:justify-start sm:space-x-4">
                  <dt>Status:</dt>
                  <dd className="capitalize font-medium text-gray-900">{order.status}</dd>
                </div>
              </dl>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-2">Shipping Address</h4>
              <address className="not-italic text-sm text-gray-500">
                <p>{order.shipping_full_name}</p>
                <p>{order.shipping_address_line1}</p>
                {order.shipping_address_line2 && <p>{order.shipping_address_line2}</p>}
                <p>{order.shipping_city}{order.shipping_district ? `, ${order.shipping_district}` : ''}, {order.shipping_country} {order.shipping_postal_code}</p>
                <p className="mt-1">{order.shipping_phone}</p>
              </address>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          {order.vendor_orders.map((vo: any) => (
            <div key={vo.id} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 sm:px-6 flex justify-between items-center border-b border-gray-200">
                <div>
                  <h4 className="text-sm font-medium text-gray-900">Sold by {vo.vendor_name_snapshot || vo.vendors?.store_name}</h4>
                  <p className="text-xs text-gray-500 font-mono mt-1">Vendor Order: {vo.id.slice(0, 8)}...</p>
                </div>
                <div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 capitalize">
                    {vo.status}
                  </span>
                </div>
              </div>

              <ul className="divide-y divide-gray-200">
                {vo.order_items.map((item: any) => (
                  <li key={item.id} className="p-4 sm:p-6 flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{item.product_name_snapshot}</p>
                      {item.variant_name_snapshot && (
                        <p className="mt-1 text-sm text-gray-500">{item.variant_name_snapshot}</p>
                      )}
                      {item.sku_snapshot && (
                        <p className="mt-1 text-xs text-gray-400 font-mono">SKU: {item.sku_snapshot}</p>
                      )}
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-sm font-medium text-gray-900">${item.line_subtotal}</p>
                      <p className="mt-1 text-xs text-gray-500">{item.quantity} x ${item.unit_price}</p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="bg-gray-50 px-4 py-3 sm:px-6 text-right border-t border-gray-200">
                <p className="text-sm font-medium text-gray-900">
                  Vendor Subtotal: ${vo.subtotal}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 border-t border-gray-200 pt-8 sm:flex sm:justify-end">
          <dl className="space-y-4 text-sm text-gray-500 sm:w-64">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd className="text-gray-900">${order.subtotal}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Shipping</dt>
              <dd className="text-gray-900">${order.shipping_total}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Tax</dt>
              <dd className="text-gray-900">${order.tax_total}</dd>
            </div>
            <div className="flex justify-between font-medium text-gray-900 text-base border-t pt-4">
              <dt>Total</dt>
              <dd>${order.total}</dd>
            </div>
          </dl>
        </div>

      </div>
    </div>
  )
}
