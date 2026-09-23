import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import CheckoutForm from './CheckoutForm'

export default async function CheckoutPage() {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) redirect('/login')

  const { data: cart } = await supabase
    .from('carts')
    .select('id')
    .eq('user_id', userData.user.id)
    .single()

  if (!cart) {
    redirect('/cart')
  }

  // Load cart items for summary
  const { data: cartItems } = await supabase
    .from('cart_items')
    .select(`
      id, quantity,
      products (name, price, status, category_id, vendors(status)),
      product_variants (price, is_active)
    `)
    .eq('cart_id', cart.id)

  if (!cartItems || cartItems.length === 0) {
    redirect('/cart')
  }

  // Verify cart validity so we don't present a broken checkout
  let subtotal = 0
  let isCartValid = true

  cartItems.forEach(item => {
    const product = item.products as any
    if (!product) { isCartValid = false; return; }
    const variant = item.product_variants as any

    const isProductActive = product.status === 'active'
    const isVendorApproved = product.vendors?.status === 'approved'
    const isVariantActive = variant ? variant.is_active : true

    if (!isProductActive || !isVendorApproved || !isVariantActive) {
      isCartValid = false
      return
    }

    const price = variant?.price !== undefined && variant?.price !== null ? variant.price : product.price
    subtotal += price * item.quantity
  })

  if (!isCartValid) {
    // If the cart has stale/invalid items, send them back to the cart to review
    redirect('/cart?error=invalid_items')
  }

  // Load saved addresses
  const { data: addresses } = await supabase
    .from('customer_addresses')
    .select('*')
    .eq('user_id', userData.user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-8">Checkout</h1>

      <div className="lg:grid lg:grid-cols-12 lg:gap-x-12 lg:items-start">
        <div className="lg:col-span-7">
          <CheckoutForm addresses={addresses || []} />
        </div>

        <div className="lg:col-span-5 mt-16 lg:mt-0 bg-gray-50 rounded-lg p-6 sm:p-8">
          <h2 className="text-lg font-medium text-gray-900">Order Summary</h2>
          <dl className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <dt className="text-sm text-gray-600">Subtotal</dt>
              <dd className="text-sm font-medium text-gray-900">${subtotal.toFixed(2)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-gray-200 pt-4">
              <dt className="text-base font-medium text-gray-900">Total</dt>
              <dd className="text-base font-bold text-gray-900">${subtotal.toFixed(2)}</dd>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Shipping and taxes are calculated during Phase 9 or later processing.
            </p>
          </dl>
        </div>
      </div>
    </main>
  )
}
