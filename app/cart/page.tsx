import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import CartItem from './CartItem'

export default async function CartPage() {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) redirect('/login')

  const { data: cart } = await supabase
    .from('carts')
    .select('id')
    .eq('user_id', userData.user.id)
    .single()

  let items: any[] = []
  if (cart) {
    const { data: cartItems } = await supabase
      .from('cart_items')
      .select(`
        id, quantity, product_id, variant_id,
        products (name, public_slug, price, main_image_url, stock_quantity, status, vendors(store_name, status), category_id),
        product_variants (price, stock_quantity, image_url, is_active, product_variant_values(product_option_values(value)))
      `)
      .eq('cart_id', cart.id)
      .order('created_at', { ascending: false })

    items = cartItems || []
  }

  // Calculate totals and format items securely on server
  let subtotal = 0
  const formattedItems = await Promise.all(items.map(async (item) => {
    const product = item.products as any

    if (!product) {
      return {
        id: item.id,
        quantity: item.quantity,
        price: 0,
        stock: 0,
        name: 'Unavailable Product',
        slug: '',
        vendorName: 'Unknown',
        image: null,
        variantOptions: null,
        isPurchasable: false,
        messages: ['This item is no longer available. Please remove it from your cart.']
      }
    }

    const variant = item.product_variants as any

    // Ensure category is active if required
    let categoryActive = true
    if (product.category_id) {
      const { data: cat } = await supabase.from('categories').select('is_active').eq('id', product.category_id).single()
      if (cat && !cat.is_active) categoryActive = false
    }

    const isProductActive = product.status === 'active'
    const isVendorApproved = product.vendors?.status === 'approved'
    const isVariantActive = variant ? variant.is_active : true
    const isPurchasable = isProductActive && isVendorApproved && categoryActive && isVariantActive

    const price = variant?.price !== undefined && variant?.price !== null ? variant.price : product.price
    const stock = variant ? variant.stock_quantity : product.stock_quantity
    const image = variant?.image_url || product.main_image_url

    let messages = []
    if (!isPurchasable) messages.push('Item is no longer available.')
    else if (item.quantity > stock) messages.push(`Only ${stock} left in stock.`)

    if (isPurchasable && item.quantity <= stock) {
      subtotal += price * item.quantity
    }

    // Format variant options
    const variantOptions = variant?.product_variant_values?.map((vv: any) => vv.product_option_values?.value).join(' / ') || null

    return {
      id: item.id,
      quantity: item.quantity,
      price,
      stock,
      name: product.name,
      slug: product.public_slug,
      vendorName: product.vendors?.store_name,
      image,
      variantOptions,
      isPurchasable,
      messages
    }
  }))

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-8">Shopping Cart</h1>

      {formattedItems.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-lg">
          <p className="text-gray-500 mb-4">Your cart is empty.</p>
          <Link href="/" className="text-blue-600 font-medium hover:text-blue-500">Continue Shopping</Link>
        </div>
      ) : (
        <div className="lg:grid lg:grid-cols-12 lg:gap-x-12 lg:items-start">
          <div className="lg:col-span-7">
            <ul className="border-t border-b border-gray-200 divide-y divide-gray-200">
              {formattedItems.map((item) => (
                <CartItem key={item.id} item={item} />
              ))}
            </ul>
          </div>

          <div className="lg:col-span-5 mt-16 lg:mt-0 bg-gray-50 rounded-lg p-6 sm:p-8">
            <h2 className="text-lg font-medium text-gray-900">Order Summary</h2>
            <dl className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <dt className="text-sm text-gray-600">Subtotal</dt>
                <dd className="text-sm font-medium text-gray-900">${subtotal.toFixed(2)}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                <dt className="text-base font-medium text-gray-900">Estimated Total</dt>
                <dd className="text-base font-medium text-gray-900">${subtotal.toFixed(2)}</dd>
              </div>
            </dl>

            <div className="mt-6">
              <Link
                href="/checkout"
                className="w-full bg-blue-600 border border-transparent rounded-md shadow-sm py-3 px-4 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-50 focus:ring-blue-500 flex justify-center text-center"
              >
                Proceed to Checkout
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
