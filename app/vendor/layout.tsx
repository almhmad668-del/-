import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function VendorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) redirect('/login')

  // Fetch the user's primary vendor connection to establish context
  // We explicitly check the user_id since the RLS SELECT policy is public
  let activeVendor = null
  const { data: vendors, error } = await supabase
    .from('vendors')
    .select('*')
    .eq('user_id', userData.user.id)
    .limit(1)

  if (vendors && vendors.length > 0) {
    activeVendor = vendors[0]
  } else {
    // Check if they are active staff via vendor_members
    const { data: members } = await supabase
      .from('vendor_members')
      .select('vendor_id, vendors(*)')
      .eq('user_id', userData.user.id)
      .eq('is_active', true)
      .limit(1)

    if (members && members.length > 0) {
      activeVendor = (members[0].vendors as unknown as Record<string, unknown>)
    }
  }

  if (error || !activeVendor) {
    // User has no vendor access, redirect them to apply
    redirect('/apply-vendor')
  }

  // If the vendor is still pending approval, trap them in the pending state
  if (activeVendor.status === 'pending') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="bg-white p-8 rounded-xl shadow-md max-w-md text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Application Pending</h2>
          <p className="text-gray-600">
            Your application for <strong>{activeVendor.store_name}</strong> is currently under review by our administrators.
          </p>
          <p className="mt-4 text-sm text-gray-500">
            We will notify you once you have been approved.
          </p>
        </div>
      </div>
    )
  }

  // Check the global role from profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single()

  const role = profile?.role
  if (role !== 'vendor' && role !== 'vendor_staff' && role !== 'admin' && role !== 'super_admin') {
    redirect('/')
  }

  // Dashboard layout for approved vendors
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            {activeVendor.store_name} Dashboard
          </h1>
          <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
            Approved
          </span>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-7xl py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  )
}
