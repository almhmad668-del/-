'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

// Helper: Ensure cart exists and get ID securely for current user
async function getOrCreateCart() {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) throw new Error('Unauthorized')
  const userId = userData.user.id

  // Find existing
  let { data: cart } = await supabase.from('carts').select('id').eq('user_id', userId).single()

  // Create if missing
  if (!cart) {
    const { data: newCart, error } = await supabase.from('carts').insert({ user_id: userId }).select('id').single()
    if (error) throw new Error(error.message)
    cart = newCart
  }

  return cart.id
}

export async function addToCart(productId: string, variantId: string | null, quantity: number = 1) {
  try {
    if (quantity < 1 || quantity > 999 || isNaN(quantity)) {
      return { error: 'Invalid quantity' }
    }

    const supabase = await createClient()

    // 1. Validate Product status & Vendor approval & Category visibility
    const { data: product, error: productError } = await supabase
      .from('products')
      .select(`
        id, status, stock_quantity, category_id,
        vendors(status)
      `)
      .eq('id', productId)
      .single()

    if (productError || !product || product.status !== 'active') return { error: 'Product unavailable' }

    const vendorData = product.vendors as unknown as { status: string }
    if (vendorData?.status !== 'approved') return { error: 'Product unavailable (Vendor)' }

    if (product.category_id) {
      const { data: cat } = await supabase.from('categories').select('is_active').eq('id', product.category_id).single()
      if (!cat?.is_active) return { error: 'Product unavailable (Category)' }
    }

    // 2. Validate Variant (if applicable) & Check Stock
    let currentStock = product.stock_quantity

    if (variantId) {
      const { data: variant, error: varError } = await supabase
        .from('product_variants')
        .select('product_id, is_active, stock_quantity')
        .eq('id', variantId)
        .single()

      if (varError || !variant || !variant.is_active || variant.product_id !== productId) {
        return { error: 'Variant unavailable or invalid' }
      }
      currentStock = variant.stock_quantity
    }

    const cartId = await getOrCreateCart()

    // 3. Find existing item to merge quantities
    const query = supabase.from('cart_items').select('id, quantity').eq('cart_id', cartId).eq('product_id', productId)
    if (variantId) {
      query.eq('variant_id', variantId)
    } else {
      query.is('variant_id', null)
    }

    const { data: existingItem } = await query.single()

    const newQuantity = (existingItem?.quantity || 0) + quantity

    // Phase 7 cart check (Note: not a reservation)
    if (newQuantity > currentStock) {
      return { error: `Cannot add ${quantity}. Only ${currentStock} in stock.` }
    }
    if (newQuantity > 999) {
      return { error: 'Maximum quantity is 999.' }
    }

    if (existingItem) {
      const { error } = await supabase
        .from('cart_items')
        .update({ quantity: newQuantity })
        .eq('id', existingItem.id)
      if (error) return { error: error.message }
    } else {
      const { error } = await supabase
        .from('cart_items')
        .insert({ cart_id: cartId, product_id: productId, variant_id: variantId || null, quantity: newQuantity })
      if (error) return { error: error.message }
    }

    revalidatePath('/cart')
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}

export async function updateCartItemQuantity(cartItemId: string, newQuantity: number) {
  try {
    if (newQuantity < 1 || newQuantity > 999 || isNaN(newQuantity)) {
      return { error: 'Invalid quantity' }
    }

    const supabase = await createClient()
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) throw new Error('Unauthorized')

    // RLS ensures they can only update their own cart items
    const { error } = await supabase
      .from('cart_items')
      .update({ quantity: newQuantity })
      .eq('id', cartItemId)

    if (error) return { error: error.message }

    revalidatePath('/cart')
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}

export async function removeCartItem(cartItemId: string) {
  try {
    const supabase = await createClient()
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) throw new Error('Unauthorized')

    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('id', cartItemId)

    if (error) return { error: error.message }

    revalidatePath('/cart')
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}
