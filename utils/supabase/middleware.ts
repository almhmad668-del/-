import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const protectedPaths = ['/vendor', '/admin', '/profile']
  const isProtectedPath = protectedPaths.some((path) => request.nextUrl.pathname.startsWith(path))

  if (!user && isProtectedPath) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const redirectResponse = NextResponse.redirect(url)
    // IMPORTANT: Copy cookies to the new response to preserve session updates
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value)
    })
    return redirectResponse
  }

  // Robust role-based routing check based on the public.profiles table
  if (user && request.nextUrl.pathname.startsWith('/vendor')) {
     const { data: profile } = await supabase
       .from('profiles')
       .select('role')
       .eq('id', user.id)
       .single()

     const role = profile?.role || 'buyer'
     // Allow 'buyer' to access /vendor ONLY so they can see the 'Pending' trap in the layout.
     // If they aren't even a pending vendor, the layout will redirect them to /apply-vendor.
     if (role !== 'buyer' && role !== 'vendor' && role !== 'admin' && role !== 'super_admin' && role !== 'vendor_staff') {
       const url = request.nextUrl.clone()
       url.pathname = '/'
       const redirectResponse = NextResponse.redirect(url)
       supabaseResponse.cookies.getAll().forEach((cookie) => {
         redirectResponse.cookies.set(cookie.name, cookie.value)
       })
       return redirectResponse
     }
  }

  if (user && request.nextUrl.pathname.startsWith('/admin')) {
     const { data: profile } = await supabase
       .from('profiles')
       .select('role')
       .eq('id', user.id)
       .single()

     const role = profile?.role || 'buyer'
     if (role !== 'admin' && role !== 'super_admin') {
       const url = request.nextUrl.clone()
       url.pathname = '/'
       const redirectResponse = NextResponse.redirect(url)
       supabaseResponse.cookies.getAll().forEach((cookie) => {
         redirectResponse.cookies.set(cookie.name, cookie.value)
       })
       return redirectResponse
     }
  }

  return supabaseResponse
}
