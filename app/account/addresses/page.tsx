import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import AddressManager from './AddressManager'

export default async function AddressesPage() {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) redirect('/login')

  const { data: addresses } = await supabase
    .from('customer_addresses')
    .select('*')
    .eq('user_id', userData.user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  return (
    <div className="bg-white shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-6">Saved Addresses</h3>
        <AddressManager addresses={addresses || []} />
      </div>
    </div>
  )
}
