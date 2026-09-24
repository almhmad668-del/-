'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { processCheckout } from '@/app/actions/orderActions'

interface Address {
  id: string
  full_name: string
  address_line1: string
  city: string
  country: string
  is_default: boolean
}

export default function CheckoutForm({ addresses }: { addresses: Address[] }) {
  const router = useRouter()
  const [selectedAddress, setSelectedAddress] = useState<string>(addresses.find(a => a.is_default)?.id || addresses[0]?.id || '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<{ message: string; productId?: string; variantId?: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAddress) {
      setError({ message: 'Please select or add a shipping address.' })
      return
    }

    setIsSubmitting(true)
    setError(null)
    const result = await processCheckout(selectedAddress)

    if (result.error) {
      setError({
        message: result.error,
        productId: result.productId,
        variantId: result.variantId
      })
      setIsSubmitting(false)
    } else if (result.success) {
      router.push(`/order-success/${result.orderId}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-4">Shipping Address</h2>
        {addresses.length === 0 ? (
          <div className="bg-yellow-50 p-4 rounded-md">
            <p className="text-sm text-yellow-700 mb-2">You need to add a shipping address before checking out.</p>
            <a href="/account/addresses" className="text-sm font-medium text-blue-600 hover:text-blue-500">Go to Address Manager</a>
          </div>
        ) : (
          <div className="space-y-4">
            {addresses.map((addr) => (
              <label key={addr.id} className={`flex items-center p-4 border rounded-lg cursor-pointer ${selectedAddress === addr.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                <input
                  type="radio"
                  name="address"
                  value={addr.id}
                  checked={selectedAddress === addr.id}
                  onChange={(e) => setSelectedAddress(e.target.value)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <div className="ml-3 flex flex-col">
                  <span className="block text-sm font-medium text-gray-900">{addr.full_name}</span>
                  <span className="block text-sm text-gray-500">{addr.address_line1}, {addr.city}, {addr.country}</span>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Checkout Failed</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error.message}</p>
                {error.productId && (
                  <p className="mt-1 font-mono text-xs">Product ID: {error.productId}</p>
                )}
                {error.variantId && (
                  <p className="mt-1 font-mono text-xs">Variant ID: {error.variantId}</p>
                )}
              </div>
              {error.productId && (
                 <div className="mt-3">
                   <a href="/cart" className="text-sm font-medium text-red-800 hover:text-red-700 underline">Return to Cart to fix this issue</a>
                 </div>
              )}
            </div>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting || addresses.length === 0}
        className="w-full bg-blue-600 border border-transparent rounded-md shadow-sm py-3 px-4 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
      >
        {isSubmitting ? 'Processing...' : 'Confirm Order'}
      </button>
    </form>
  )
}
