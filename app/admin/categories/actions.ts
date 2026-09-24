'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

async function verifyAdmin() {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single()

  if (profile?.role !== 'admin' && profile?.role !== 'super_admin') {
    throw new Error('Forbidden')
  }
  return supabase
}

export async function createCategory(formData: FormData) {
  try {
    const supabase = await verifyAdmin()

    const name = formData.get('name') as string
    const slug = formData.get('slug') as string
    const description = formData.get('description') as string
    const isActive = formData.get('isActive') === 'on'

    if (!name || !slug) {
      return { error: 'Name and Slug are required.' }
    }

    const { error } = await supabase.from('categories').insert({
      name,
      slug,
      description: description || null,
      is_active: isActive,
    })

    if (error) {
      if (error.code === '23505') {
        return { error: 'Category slug already exists.' }
      }
      return { error: error.message }
    }

    revalidatePath('/admin/categories')
    return { success: true }
  } catch (err: unknown) {
    if (err instanceof Error) return { error: err.message }
    return { error: 'Unknown error occurred' }
  }
}

export async function toggleCategoryStatus(categoryId: string, currentStatus: boolean) {
  try {
    const supabase = await verifyAdmin()

    const { error } = await supabase
      .from('categories')
      .update({ is_active: !currentStatus })
      .eq('id', categoryId)

    if (error) return { error: error.message }

    revalidatePath('/admin/categories')
    // We also revalidate storefront routes because category visibility affects public feeds
    revalidatePath('/')
    revalidatePath('/categories')
    return { success: true }
  } catch (err: unknown) {
    if (err instanceof Error) return { error: err.message }
    return { error: 'Unknown error occurred' }
  }
}
