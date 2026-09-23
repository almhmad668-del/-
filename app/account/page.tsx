import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function AccountPage() {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', userData.user.id).single()

  return (
    <div className="bg-white shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900">Profile Information</h3>
        <div className="mt-5 max-w-xl text-sm text-gray-500">
          <p>This is your basic account information.</p>
        </div>
        <div className="mt-5 border-t border-gray-200 pt-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <div className="mt-1 text-sm text-gray-900">{userData.user.email}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Full Name</label>
            <div className="mt-1 text-sm text-gray-900">{profile?.full_name || 'Not provided'}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Role</label>
            <div className="mt-1 text-sm text-gray-900 capitalize">{profile?.role}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
