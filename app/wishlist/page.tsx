import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import WishlistItem from './WishlistItem'

export default async function WishlistPage() {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) redirect('/login')

  const { data: wishlist } = await supabase
    .from('wishlists')
    .select('id')
    .eq('user_id', userData.user.id)
    .single()

  let items: any[] = []
  if (wishlist) {
    const { data: wlItems } = await supabase
      .from('wishlist_items')
      .select(`
        id, product_id,
        products (name, public_slug, price, main_image_url, stock_quantity, status, vendors(store_name, status), category_id)
      `)
      .eq('wishlist_id', wishlist.id)
      .order('created_at', { ascending: false })

    items = wlItems || []
  }

  const formattedItems = await Promise.all(items.map(async (item) => {
    const product = item.products as any
    if (!product) {
       return {
         id: item.product_id,
         name: 'Unavailable Product',
         slug: '',
         vendorName: 'Unknown',
         price: 0,
         image: null,
         isPurchasable: false,
         stock: 0
       }
    }

    let categoryActive = true
    if (product.category_id) {
      const { data: cat } = await supabase.from('categories').select('is_active').eq('id', product.category_id).single()
      if (cat && !cat.is_active) categoryActive = false
    }

    const isProductActive = product.status === 'active'
    const isVendorApproved = product.vendors?.status === 'approved'
    const isPurchasable = isProductActive && isVendorApproved && categoryActive

    return {
      id: item.product_id, // we'll use product_id for un-wishlisting
      name: product.name,
      slug: product.public_slug,
      vendorName: product.vendors?.store_name,
      price: product.price,
      image: product.main_image_url,
      isPurchasable,
      stock: product.stock_quantity
    }
  }))

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-8">Your Wishlist</h1>

      {formattedItems.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-lg">
          <p className="text-gray-500 mb-4">Your wishlist is empty.</p>
          <Link href="/" className="text-blue-600 font-medium hover:text-blue-500">Continue Shopping</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {formattedItems.map((item) => (
            <WishlistItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </main>
  )
}
