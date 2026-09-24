'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createAddress(formData: FormData) {
  try {
    const supabase = await createClient()
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) throw new Error('Unauthorized')

    const fullName = formData.get('fullName') as string
    const phone = formData.get('phone') as string
    const country = formData.get('country') as string
    const city = formData.get('city') as string
    const district = formData.get('district') as string
    const addressLine1 = formData.get('addressLine1') as string
    const addressLine2 = formData.get('addressLine2') as string
    const postalCode = formData.get('postalCode') as string
    const isDefault = formData.get('isDefault') === 'on'

    if (!fullName || !phone || !country || !city || !addressLine1) {
      return { error: 'Missing required fields' }
    }

    const { data: address, error } = await supabase
      .from('customer_addresses')
      .insert({
        user_id: userData.user.id,
        full_name: fullName,
        phone,
        country,
        city,
        district: district || null,
        address_line1: addressLine1,
        address_line2: addressLine2 || null,
        postal_code: postalCode || null,
        is_default: isDefault
      })
      .select('id')
      .single()

    if (error) return { error: error.message }

    // If marked as default, run the safe function to clear others
    if (isDefault) {
      await supabase.rpc('set_default_address', { p_user_id: userData.user.id, p_address_id: address.id })
    } else {
      // Check if they have NO default, and if so make this the default
      const { count } = await supabase.from('customer_addresses').select('id', { count: 'exact', head: true }).eq('user_id', userData.user.id).eq('is_default', true)
      if (count === 0) {
        await supabase.rpc('set_default_address', { p_user_id: userData.user.id, p_address_id: address.id })
      }
    }

    revalidatePath('/account/addresses')
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}

export async function deleteAddress(addressId: string) {
  try {
    const supabase = await createClient()
    // RLS ensures only the owner can delete
    const { error } = await supabase.from('customer_addresses').delete().eq('id', addressId)
    if (error) return { error: error.message }

    revalidatePath('/account/addresses')
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}

export async function setDefaultAddress(addressId: string) {
  try {
    const supabase = await createClient()
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) throw new Error('Unauthorized')

    // RLS will prevent this if addressId isn't theirs, but we also pass user_id to the RPC which validates ownership via update constraint inside the RPC.
    // Actually the RPC relies on user_id passed to it. Let's make sure the address belongs to them first for extra safety.
    const { data: check } = await supabase.from('customer_addresses').select('id').eq('id', addressId).eq('user_id', userData.user.id).single()

    if (!check) return { error: 'Address not found or unauthorized' }

    const { error } = await supabase.rpc('set_default_address', { p_user_id: userData.user.id, p_address_id: addressId })
    if (error) return { error: error.message }

    revalidatePath('/account/addresses')
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}
