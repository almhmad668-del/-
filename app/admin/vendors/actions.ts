'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function approveVendor(vendorId: string) {
  const supabase = await createClient()

  // Execute the secure RPC function. This function uses SECURITY DEFINER
  // to bypass RLS and securely escalate the owner's global profile role to 'vendor'
  const { error } = await supabase.rpc('approve_vendor', {
    p_vendor_id: vendorId
  })

  if (error) {
    console.error('Error approving vendor:', error)
    return { error: error.message }
  }

  revalidatePath('/admin/vendors')
  return { success: true }
}
