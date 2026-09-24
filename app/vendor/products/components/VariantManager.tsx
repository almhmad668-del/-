'use client'

import { useState } from 'react'
import { createOption, createOptionValue, createVariant } from '../variantActions'
import { useRouter } from 'next/navigation'

interface VariantManagerProps {
  productId: string
  options: any[] // We can type these more strictly later
  variants: any[]
}

export default function VariantManager({ productId, options, variants }: VariantManagerProps) {
  const router = useRouter()
  const [newOptionName, setNewOptionName] = useState('')
  const [newValueMap, setNewValueMap] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAddOption = async () => {
    if (!newOptionName.trim()) return
    setIsSubmitting(true)
    const result = await createOption(productId, newOptionName.trim())
    if (result.error) setError(result.error)
    else setNewOptionName('')
    setIsSubmitting(false)
    router.refresh()
  }

  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({})

  const handleAddValue = async (optionId: string) => {
    const val = newValueMap[optionId]
    if (!val?.trim()) return
    setIsSubmitting(true)
    const result = await createOptionValue(productId, optionId, val.trim())
    if (result.error) setError(result.error)
    else setNewValueMap({ ...newValueMap, [optionId]: '' })
    setIsSubmitting(false)
    router.refresh()
  }

  const handleCreateVariant = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    // Ensure one value per option is selected
    const selectedValueIds = Object.values(selectedOptions)
    if (selectedValueIds.length !== options.length) {
      setError('Please select a value for every option to create a variant.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    const formData = new FormData(e.currentTarget)

    const result = await createVariant(productId, selectedValueIds, formData)
    if (result.error) {
      setError(result.error)
    } else {
      setSelectedOptions({})
      // Form reset is handled by standard HTML behavior or we could use refs, simplified here
      ;(e.target as HTMLFormElement).reset()
    }
    setIsSubmitting(false)
    router.refresh()
  }

  return (
    <div className="space-y-8 mt-8 border-t pt-8">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Product Options</h2>

        {error && (
          <div className="mb-4 bg-red-50 text-red-700 p-3 rounded-md text-sm">{error}</div>
        )}

        <div className="space-y-4">
          {options.map((opt) => (
            <div key={opt.id} className="border rounded-md p-4 bg-gray-50">
              <h3 className="font-semibold text-gray-800 mb-2">{opt.name}</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {opt.values?.map((val: any) => (
                  <span key={val.id} className="bg-white border px-2 py-1 rounded text-sm text-gray-600">
                    {val.value}
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newValueMap[opt.id] || ''}
                  onChange={(e) => setNewValueMap({ ...newValueMap, [opt.id]: e.target.value })}
                  placeholder="New value (e.g. Red, Small)"
                  className="border rounded px-2 py-1 text-sm flex-1 max-w-xs"
                />
                <button
                  onClick={() => handleAddValue(opt.id)}
                  disabled={isSubmitting}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1 rounded text-sm disabled:opacity-50"
                >
                  Add Value
                </button>
              </div>
            </div>
          ))}

          <div className="flex gap-2">
            <input
              type="text"
              value={newOptionName}
              onChange={(e) => setNewOptionName(e.target.value)}
              placeholder="New Option Name (e.g. Color, Size)"
              className="border rounded px-2 py-1 text-sm flex-1 max-w-xs"
            />
            <button
              onClick={handleAddOption}
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
            >
              Add Option
            </button>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Product Variants</h2>

        {options.length > 0 && (
          <form onSubmit={handleCreateVariant} className="mb-8 p-4 border rounded-md bg-white shadow-sm space-y-4">
            <h3 className="font-semibold text-gray-800">Create New Variant</h3>

            <div className="flex flex-wrap gap-4">
              {options.map(opt => (
                <div key={opt.id} className="min-w-[150px]">
                  <label className="block text-xs font-medium text-gray-700 mb-1">{opt.name}</label>
                  <select
                    required
                    value={selectedOptions[opt.id] || ''}
                    onChange={(e) => setSelectedOptions({ ...selectedOptions, [opt.id]: e.target.value })}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 bg-white"
                  >
                    <option value="" disabled>Select {opt.name}</option>
                    {opt.values?.map((val: any) => (
                      <option key={val.id} value={val.id}>{val.value}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">SKU (Optional)</label>
                <input type="text" name="sku" className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm border p-2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Price Override (USD)</label>
                <input type="number" name="price" step="0.01" min="0" className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm border p-2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Compare Price (USD)</label>
                <input type="number" name="compare_at_price" step="0.01" min="0" className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm border p-2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Stock Quantity</label>
                <input type="number" name="stockQuantity" required defaultValue={0} min="0" className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm border p-2" />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
              >
                Create Variant
              </button>
            </div>
          </form>
        )}

        <div className="bg-white border rounded-md shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Combination</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {variants.map(v => (
                <tr key={v.id}>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {v.values?.map((val: any) => val.value).join(' / ') || 'Default'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{v.sku || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{v.price ? `$${v.price}` : 'Base Price'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{v.stock_quantity}</td>
                </tr>
              ))}
              {variants.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-sm text-gray-500 text-center">No variants created yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
