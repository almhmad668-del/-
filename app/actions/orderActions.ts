'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function processCheckout(addressId: string) {
  try {
    const supabase = await createClient()
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) throw new Error('Unauthorized')

    if (!addressId) {
      return { error: 'Please select a shipping address.' }
    }

    // Call the Postgres RPC
    // It is SECURITY DEFINER, so it will execute exactly as we instructed,
    // protecting against race conditions and invalidating any bad cart data.
    const { data, error } = await supabase.rpc('checkout_cart', {
      p_user_id: userData.user.id,
      p_address_id: addressId
    })

    if (error) {
      return { error: error.message }
    }

    // Handle structural JSON responses
    if (data && typeof data === 'object') {
      if (data.code === 'INSUFFICIENT_STOCK') {
        return {
          error: data.message || 'Insufficient stock for one or more items.',
          code: data.code,
          productId: data.product_id,
          variantId: data.variant_id
        }
      }

      if (data.code === 'SUCCESS') {
        revalidatePath('/cart')
        revalidatePath('/account/orders')
        return { success: true, orderId: data.order_id }
      }
    }

    return { error: 'An unexpected error occurred during checkout.' }

  } catch (err: any) {
    return { error: err.message }
  }
}
