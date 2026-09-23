import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) redirect('/login')

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:grid lg:grid-cols-12 lg:gap-8">
      <aside className="lg:col-span-3 mb-8 lg:mb-0">
        <nav className="space-y-1">
          <Link href="/account" className="bg-gray-50 text-gray-900 group flex items-center px-3 py-2 text-sm font-medium rounded-md">
            Profile
          </Link>
          <Link href="/account/addresses" className="text-gray-600 hover:bg-gray-50 hover:text-gray-900 group flex items-center px-3 py-2 text-sm font-medium rounded-md">
            Addresses
          </Link>
          <Link href="/account/orders" className="text-gray-600 hover:bg-gray-50 hover:text-gray-900 group flex items-center px-3 py-2 text-sm font-medium rounded-md">
            Orders
          </Link>
          <Link href="/cart" className="text-gray-600 hover:bg-gray-50 hover:text-gray-900 group flex items-center px-3 py-2 text-sm font-medium rounded-md">
            Cart
          </Link>
          <Link href="/wishlist" className="text-gray-600 hover:bg-gray-50 hover:text-gray-900 group flex items-center px-3 py-2 text-sm font-medium rounded-md">
            Wishlist
          </Link>
        </nav>
      </aside>
      <main className="lg:col-span-9">
        {children}
      </main>
    </div>
  )
}
