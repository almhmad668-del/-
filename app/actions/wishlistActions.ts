'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

async function getOrCreateWishlist() {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) throw new Error('Unauthorized')
  const userId = userData.user.id

  let { data: wishlist } = await supabase.from('wishlists').select('id').eq('user_id', userId).single()

  if (!wishlist) {
    const { data: newWishlist, error } = await supabase.from('wishlists').insert({ user_id: userId }).select('id').single()
    if (error) throw new Error(error.message)
    wishlist = newWishlist
  }

  return wishlist.id
}

export async function toggleWishlistItem(productId: string) {
  try {
    const supabase = await createClient()
    const wishlistId = await getOrCreateWishlist()

    // Verify Product exists and is active
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('status')
      .eq('id', productId)
      .single()

    if (productError || !product || product.status !== 'active') {
      return { error: 'Product unavailable' }
    }

    // Check if it's already in wishlist
    const { data: existing } = await supabase
      .from('wishlist_items')
      .select('id')
      .eq('wishlist_id', wishlistId)
      .eq('product_id', productId)
      .single()

    if (existing) {
      // Remove
      await supabase.from('wishlist_items').delete().eq('id', existing.id)
      revalidatePath('/wishlist')
      revalidatePath(`/products/[slug]`, 'page') // to update heart icon state
      return { success: true, action: 'removed' }
    } else {
      // Add
      await supabase.from('wishlist_items').insert({ wishlist_id: wishlistId, product_id: productId })
      revalidatePath('/wishlist')
      revalidatePath(`/products/[slug]`, 'page')
      return { success: true, action: 'added' }
    }

  } catch (err: any) {
    return { error: err.message }
  }
}
