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

const validTransitions: Record<string, string[]> = {
  pending: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: []
}

export async function updateVendorOrderStatus(vendorOrderId: string, newStatus: string) {
  try {
    const vendorId = await getAuthorizedVendorId()
    const supabase = await createClient()

    // Fetch order first to check transition rules
    const { data: order, error: orderError } = await supabase
      .from('vendor_orders')
      .select('status')
      .eq('id', vendorOrderId)
      .eq('vendor_id', vendorId) // Enforce ownership security
      .single()

    if (orderError || !order) {
      return { error: 'Vendor order not found or unauthorized' }
    }

    if (!validTransitions[order.status]?.includes(newStatus)) {
      return { error: `Invalid status transition from ${order.status} to ${newStatus}` }
    }

    const { error: updateError } = await supabase
      .from('vendor_orders')
      .update({ status: newStatus })
      .eq('id', vendorOrderId)

    if (updateError) {
      return { error: updateError.message }
    }

    revalidatePath('/vendor/orders')
    revalidatePath(`/vendor/orders/${vendorOrderId}`)
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}
