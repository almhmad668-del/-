import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import OrderStatusSelector from '../OrderStatusSelector'

export default async function VendorOrderDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) redirect('/login')

  const { data: vo, error } = await supabase
    .from('vendor_orders')
    .select(`
      id, status, subtotal, shipping_total, discount_total, total, created_at,
      orders (
        id, shipping_full_name, shipping_phone, shipping_country,
        shipping_city, shipping_district, shipping_address_line1,
        shipping_address_line2, shipping_postal_code
      ),
      order_items (
        id, quantity, unit_price, line_subtotal,
        product_name_snapshot, variant_name_snapshot, sku_snapshot
      )
    `)
    .eq('id', resolvedParams.id)
    .single()

  if (error || !vo) {
    notFound()
  }

  const order = vo.orders as any

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Vendor Order Details</h1>
        <Link href="/vendor/orders" className="text-sm font-medium text-blue-600 hover:text-blue-500">
          &larr; Back to Orders
        </Link>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row sm:justify-between mb-6 pb-6 border-b border-gray-200">
           <div>
             <h2 className="text-lg font-medium text-gray-900">Status Management</h2>
             <p className="text-sm text-gray-500 mt-1">Update fulfillment status to notify the customer.</p>
           </div>
           <div className="mt-4 sm:mt-0">
             <OrderStatusSelector orderId={vo.id} currentStatus={vo.status} />
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">Order Info</h3>
            <dl className="text-sm text-gray-500 space-y-2">
              <div className="flex justify-between">
                <dt>Vendor Order ID:</dt>
                <dd className="font-mono text-gray-900">{vo.id.slice(0, 8)}...</dd>
              </div>
              <div className="flex justify-between">
                <dt>Master Order ID:</dt>
                <dd className="font-mono text-gray-900">{order.id.slice(0, 8)}...</dd>
              </div>
              <div className="flex justify-between">
                <dt>Date:</dt>
                <dd className="text-gray-900">{new Date(vo.created_at).toLocaleString()}</dd>
              </div>
            </dl>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">Shipping Address</h3>
            <address className="not-italic text-sm text-gray-500">
              <p className="font-medium text-gray-900">{order.shipping_full_name}</p>
              <p>{order.shipping_address_line1}</p>
              {order.shipping_address_line2 && <p>{order.shipping_address_line2}</p>}
              <p>{order.shipping_city}{order.shipping_district ? `, ${order.shipping_district}` : ''}, {order.shipping_country} {order.shipping_postal_code}</p>
              <p className="mt-1">{order.shipping_phone}</p>
            </address>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg font-medium text-gray-900">Items to Fulfill</h3>
        </div>
        <ul className="divide-y divide-gray-200">
          {vo.order_items.map((item: any) => (
            <li key={item.id} className="p-6 flex items-center justify-between">
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
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 sm:flex sm:justify-end">
          <dl className="space-y-2 text-sm text-gray-500 sm:w-64">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd className="text-gray-900">${vo.subtotal}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Shipping</dt>
              <dd className="text-gray-900">${vo.shipping_total}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Discount</dt>
              <dd className="text-gray-900">${vo.discount_total}</dd>
            </div>
            <div className="flex justify-between font-medium text-gray-900 text-base border-t pt-2">
              <dt>Vendor Total</dt>
              <dd>${vo.total}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
