'use client'

import { useState } from 'react'
import { createAddress, deleteAddress, setDefaultAddress } from '@/app/actions/addressActions'

interface Address {
  id: string
  full_name: string
  phone: string
  country: string
  city: string
  district: string | null
  address_line1: string
  address_line2: string | null
  postal_code: string | null
  is_default: boolean
}

export default function AddressManager({ addresses }: { addresses: Address[] }) {
  const [showForm, setShowForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    const formData = new FormData(e.currentTarget)

    const result = await createAddress(formData)
    if (result.error) {
      setError(result.error)
    } else {
      setShowForm(false)
    }
    setIsSubmitting(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this address?')) return
    await deleteAddress(id)
  }

  const handleSetDefault = async (id: string) => {
    await setDefaultAddress(id)
  }

  return (
    <div>
      {addresses.length === 0 ? (
        <p className="text-gray-500 mb-6">You have no saved addresses.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-8">
          {addresses.map((address) => (
            <div key={address.id} className="relative rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm flex items-center space-x-3 hover:border-gray-400">
              <div className="flex-1 min-w-0">
                <span className="absolute inset-0" aria-hidden="true" />
                <p className="text-sm font-medium text-gray-900 flex justify-between">
                  {address.full_name}
                  {address.is_default && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      Default
                    </span>
                  )}
                </p>
                <p className="text-sm text-gray-500 truncate">{address.address_line1}</p>
                {address.address_line2 && <p className="text-sm text-gray-500 truncate">{address.address_line2}</p>}
                <p className="text-sm text-gray-500 truncate">
                  {address.city}{address.district ? `, ${address.district}` : ''}, {address.country} {address.postal_code}
                </p>
                <p className="text-sm text-gray-500 truncate">{address.phone}</p>

                <div className="mt-4 flex space-x-4 relative z-10">
                  {!address.is_default && (
                    <button onClick={() => handleSetDefault(address.id)} className="text-sm text-blue-600 hover:text-blue-500">
                      Set as Default
                    </button>
                  )}
                  <button onClick={() => handleDelete(address.id)} className="text-sm text-red-600 hover:text-red-500">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <form onSubmit={handleSubmit} className="border-t pt-6 space-y-4 max-w-lg">
          <h4 className="font-medium text-gray-900">Add New Address</h4>
          {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Full Name</label>
              <input type="text" name="fullName" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Phone</label>
              <input type="tel" name="phone" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Country</label>
              <input type="text" name="country" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">City</label>
              <input type="text" name="city" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">District (Optional)</label>
              <input type="text" name="district" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Postal Code</label>
              <input type="text" name="postalCode" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700">Address Line 1</label>
              <input type="text" name="addressLine1" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700">Address Line 2 (Optional)</label>
              <input type="text" name="addressLine2" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
            </div>
          </div>
          <div className="flex items-center">
            <input type="checkbox" name="isDefault" id="isDefault" className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <label htmlFor="isDefault" className="ml-2 block text-sm text-gray-900">Set as default address</label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
              {isSubmitting ? 'Saving...' : 'Save Address'}
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Add New Address
        </button>
      )}
    </div>
  )
}
