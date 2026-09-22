'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

// Helper to securely get the authorized vendor_id for the current user
async function getAuthorizedVendorId() {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) throw new Error('Unauthorized')

  // Check global role first
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single()

  if (profile?.role !== 'vendor' && profile?.role !== 'vendor_staff') {
    throw new Error('Forbidden: Incorrect global role')
  }

  // 1. Check if they are the direct owner
  const { data: vendors } = await supabase
    .from('vendors')
    .select('id, status')
    .eq('user_id', userData.user.id)
    .limit(1)

  if (vendors && vendors.length > 0) {
    if (vendors[0].status !== 'approved') {
      throw new Error('Forbidden: Vendor application is pending or suspended')
    }
    return vendors[0].id
  }

  // 2. If not the owner, check if they are active staff via vendor_members
  const { data: members } = await supabase
    .from('vendor_members')
    .select('vendor_id, vendors(status)')
    .eq('user_id', userData.user.id)
    .eq('is_active', true)
    .limit(1)

  if (!members || members.length === 0) {
    throw new Error('Forbidden: No active vendor association')
  }

  // Typecast the joined relationship since Supabase dynamic types can be tricky
  const vendorData = members[0].vendors as unknown as { status: string } | null
  const vendorStatus = vendorData?.status
  if (vendorStatus !== 'approved') {
    throw new Error('Forbidden: Vendor application is pending or suspended')
  }

  return members[0].vendor_id
}

export async function createProduct(formData: FormData) {
  try {
    const vendorId = await getAuthorizedVendorId()
    const supabase = await createClient()

    const name = formData.get('name') as string
    const slug = formData.get('slug') as string
    const description = formData.get('description') as string
    const sku = formData.get('sku') as string
    const price = parseFloat(formData.get('price') as string)
    const stockQuantity = parseInt(formData.get('stockQuantity') as string, 10)
    const status = formData.get('status') as string || 'draft'

    if (!name || !slug || isNaN(price) || isNaN(stockQuantity) || price < 0 || stockQuantity < 0) {
      return { error: 'Invalid product data provided.' }
    }

    const { error } = await supabase.from('products').insert({
      vendor_id: vendorId, // SERVER CONTROLLED: Never trust client input for ownership
      name,
      slug,
      description,
      sku: sku || null, // Map empty string to null to prevent unique constraint conflicts
      price,
      stock_quantity: stockQuantity,
      status,
      currency: 'USD'
    })

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        return { error: 'The provided Slug or SKU is already in use by another product.' }
      }
      return { error: error.message }
    }

    revalidatePath('/vendor/products')
    return { success: true }
  } catch (err: unknown) {
    if (err instanceof Error) {
      return { error: err.message }
    }
    return { error: 'An unknown error occurred.' }
  }
}

export async function updateProduct(productId: string, formData: FormData) {
  try {
    const vendorId = await getAuthorizedVendorId()
    const supabase = await createClient()

    const name = formData.get('name') as string
    const slug = formData.get('slug') as string
    const description = formData.get('description') as string
    const sku = formData.get('sku') as string
    const price = parseFloat(formData.get('price') as string)
    const stockQuantity = parseInt(formData.get('stockQuantity') as string, 10)
    const status = formData.get('status') as string || 'draft'
    const mainImageUrl = formData.get('mainImageUrl') as string

    if (!name || !slug || isNaN(price) || isNaN(stockQuantity) || price < 0 || stockQuantity < 0) {
      return { error: 'Invalid product data provided.' }
    }

    const { error } = await supabase
      .from('products')
      .update({
        name,
        slug,
        description,
        sku: sku || null, // Map empty string to null to prevent unique constraint conflicts
        price,
        stock_quantity: stockQuantity,
        status,
        main_image_url: mainImageUrl || null
      })
      .eq('id', productId)
      .eq('vendor_id', vendorId) // Ensure they only update their own product

    if (error) {
      if (error.code === '23505') {
        return { error: 'The provided Slug or SKU is already in use by another product.' }
      }
      return { error: error.message }
    }

    revalidatePath('/vendor/products')
    return { success: true }
  } catch (err: unknown) {
    if (err instanceof Error) {
      return { error: err.message }
    }
    return { error: 'An unknown error occurred.' }
  }
}

export async function archiveProduct(productId: string) {
  try {
    const vendorId = await getAuthorizedVendorId()
    const supabase = await createClient()

    // Soft deletion: update status to 'archived'.
    // RLS ensures they can only update their own products.
    const { error } = await supabase
      .from('products')
      .update({ status: 'archived' })
      .eq('id', productId)
      .eq('vendor_id', vendorId) // Extra safety check

    if (error) {
      return { error: error.message }
    }

    revalidatePath('/vendor/products')
    return { success: true }
  } catch (err: unknown) {
    if (err instanceof Error) {
      return { error: err.message }
    }
    return { error: 'An unknown error occurred.' }
  }
}
