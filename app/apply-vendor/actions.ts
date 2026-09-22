'use server'

import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export async function applyForVendor(formData: FormData) {
  const storeName = formData.get('storeName') as string
  const slug = formData.get('slug') as string

  if (!storeName || !slug) {
    return { error: 'Store Name and Slug are required.' }
  }

  const supabase = await createClient()

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData?.user) {
    return { error: 'You must be logged in to apply.' }
  }

  // 1. Insert into vendors
  const { data: vendor, error: vendorError } = await supabase
    .from('vendors')
    .insert({
      store_name: storeName,
      slug: slug,
      user_id: userData.user.id,
      status: 'pending' // Enforced by DB default, but explicit here
    })
    .select('id')
    .single()

  if (vendorError) {
    if (vendorError.code === '23505') {
      return { error: 'That slug is already taken. Please choose another.' }
    }
    return { error: vendorError.message }
  }

  // 2. Insert into vendor_members
  const { error: memberError } = await supabase
    .from('vendor_members')
    .insert({
      vendor_id: vendor.id,
      user_id: userData.user.id,
      role: 'owner',
      is_active: true
    })

  if (memberError) {
    return { error: memberError.message }
  }

  redirect('/vendor')
}
