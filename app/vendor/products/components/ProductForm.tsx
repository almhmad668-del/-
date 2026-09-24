'use client'

import { useState } from 'react'
import { createProduct, updateProduct } from '../actions'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import { useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'

interface ProductFormProps {
  productId?: string
  initialData?: {
    name: string
    slug: string
    description: string | null
    sku: string | null
    price: number
    stock_quantity: number
    status: string
    main_image_url: string | null
    category_id: string | null
  }
}

export default function ProductForm({ productId, initialData }: ProductFormProps) {
  const [categories, setCategories] = useState<{ id: string, name: string }[]>([])

  useEffect(() => {
    const fetchCategories = async () => {
      const supabase = createClient()
      const { data } = await supabase.from('categories').select('id, name').order('name')
      // RLS on categories allows public select where is_active = true, so this is safe and will only fetch active categories
      if (data) setCategories(data)
    }
    fetchCategories()
  }, [])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)

    let result;
    if (productId) {
      result = await updateProduct(productId, formData)
    } else {
      result = await createProduct(formData)
    }

    if (result?.error) {
      setError(result.error)
      setIsLoading(false)
    } else {
      router.push('/vendor/products')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">Product Name</label>
        <input type="text" name="name" id="name" defaultValue={initialData?.name} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
      </div>

      <div>
        <label htmlFor="slug" className="block text-sm font-medium text-gray-700">URL Slug</label>
        <input type="text" name="slug" id="slug" defaultValue={initialData?.slug} required pattern="[a-z0-9-]+" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
        <p className="mt-1 text-xs text-gray-500">Only lowercase letters, numbers, and hyphens. Must be unique.</p>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
        <textarea name="description" id="description" defaultValue={initialData?.description || ''} rows={3} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"></textarea>
      </div>

      <div>
        <label htmlFor="categoryId" className="block text-sm font-medium text-gray-700">Category</label>
        <select name="categoryId" id="categoryId" required defaultValue={initialData?.category_id || ''} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 bg-white">
          <option value="" disabled>Select a category</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="price" className="block text-sm font-medium text-gray-700">Price (USD)</label>
          <input type="number" name="price" id="price" defaultValue={initialData?.price} min="0" step="0.01" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
        </div>
        <div>
          <label htmlFor="stockQuantity" className="block text-sm font-medium text-gray-700">Stock Quantity</label>
          <input type="number" name="stockQuantity" id="stockQuantity" defaultValue={initialData?.stock_quantity} min="0" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
        </div>
      </div>

      <div>
        <label htmlFor="sku" className="block text-sm font-medium text-gray-700">SKU (Optional)</label>
        <input type="text" name="sku" id="sku" defaultValue={initialData?.sku || ''} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
      </div>

      <div>
        <label htmlFor="mainImageUrl" className="block text-sm font-medium text-gray-700">Main Image URL (Optional)</label>
        <input type="url" name="mainImageUrl" id="mainImageUrl" defaultValue={initialData?.main_image_url || ''} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
      </div>

      <div>
        <label htmlFor="status" className="block text-sm font-medium text-gray-700">Status</label>
        <select name="status" id="status" defaultValue={initialData?.status || 'draft'} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 bg-white">
          <option value="draft">Draft</option>
          <option value="active">Active</option>
        </select>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Link href="/vendor/products" className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
          Cancel
        </Link>
        <button type="submit" disabled={isLoading} className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
          {isLoading ? 'Saving...' : 'Save Product'}
        </button>
      </div>
    </form>
  )
}
