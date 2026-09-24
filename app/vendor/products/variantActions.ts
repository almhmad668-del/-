'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

async function getAuthorizedVendorId() {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) throw new Error('Unauthorized')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userData.user.id).single()
  if (profile?.role !== 'vendor' && profile?.role !== 'vendor_staff') throw new Error('Forbidden')

  const { data: vendors } = await supabase.from('vendors').select('id, status').eq('user_id', userData.user.id).limit(1)
  if (vendors && vendors.length > 0) {
    if (vendors[0].status !== 'approved') throw new Error('Forbidden')
    return vendors[0].id
  }

  const { data: members } = await supabase.from('vendor_members').select('vendor_id, vendors(status)').eq('user_id', userData.user.id).eq('is_active', true).limit(1)
  if (!members || members.length === 0) throw new Error('Forbidden')

  const vendorData = members[0].vendors as unknown as { status: string } | null
  if (vendorData?.status !== 'approved') throw new Error('Forbidden')

  return members[0].vendor_id
}

// Ensure the product belongs to the vendor
async function verifyProductOwnership(productId: string) {
  const vendorId = await getAuthorizedVendorId()
  const supabase = await createClient()
  const { data, error } = await supabase.from('products').select('id').eq('id', productId).eq('vendor_id', vendorId).single()
  if (error || !data) throw new Error('Product not found or access denied')
  return true
}

export async function createOption(productId: string, name: string) {
  try {
    await verifyProductOwnership(productId)
    const supabase = await createClient()
    const { error } = await supabase.from('product_options').insert({ product_id: productId, name })
    if (error) return { error: error.message }
    revalidatePath(`/vendor/products/${productId}`)
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}

export async function createOptionValue(productId: string, optionId: string, value: string) {
  try {
    await verifyProductOwnership(productId)
    const supabase = await createClient()
    const { error } = await supabase.from('product_option_values').insert({ option_id: optionId, value })
    if (error) return { error: error.message }
    revalidatePath(`/vendor/products/${productId}`)
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}

export async function createVariant(productId: string, optionValueIds: string[], formData: FormData) {
  try {
    await verifyProductOwnership(productId)
    const supabase = await createClient()

    const sku = formData.get('sku') as string
    const priceStr = formData.get('price') as string
    const comparePriceStr = formData.get('compare_at_price') as string
    const stockQuantity = parseInt(formData.get('stockQuantity') as string, 10)

    if (isNaN(stockQuantity) || stockQuantity < 0) return { error: 'Invalid stock quantity' }

    const price = priceStr ? parseFloat(priceStr) : null
    if (price !== null && (isNaN(price) || price < 0)) return { error: 'Invalid price' }

    const compareAtPrice = comparePriceStr ? parseFloat(comparePriceStr) : null
    if (compareAtPrice !== null && (isNaN(compareAtPrice) || compareAtPrice < 0)) return { error: 'Invalid compare price' }

    // Generate canonical key from sorted option value IDs
    const canonicalKey = optionValueIds.slice().sort().join('|')

    // 1. Create Variant
    const { data: variant, error: variantError } = await supabase
      .from('product_variants')
      .insert({
        product_id: productId,
        sku: sku || null,
        price,
        compare_at_price: compareAtPrice,
        stock_quantity: stockQuantity,
        canonical_combination_key: canonicalKey || null
      })
      .select('id')
      .single()

    if (variantError) return { error: variantError.message }

    // 2. Attach Option Values
    if (optionValueIds.length > 0) {
      const variantValues = optionValueIds.map(valId => ({
        variant_id: variant.id,
        option_value_id: valId
      }))

      const { error: valuesError } = await supabase.from('product_variant_values').insert(variantValues)
      if (valuesError) return { error: valuesError.message }
    }

    revalidatePath(`/vendor/products/${productId}`)
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}
