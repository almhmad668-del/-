'use client'

import { useState } from 'react'
import { updateVendorOrderStatus } from './actions'

export default function OrderStatusSelector({ orderId, currentStatus }: { orderId: string, currentStatus: string }) {
  const [status, setStatus] = useState(currentStatus)
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Provide transitions for UI logic
  const validTransitions: Record<string, string[]> = {
    pending: ['processing', 'cancelled'],
    processing: ['shipped', 'cancelled'],
    shipped: ['delivered'],
    delivered: [],
    cancelled: []
  }

  const allowedNext = validTransitions[currentStatus] || []

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value
    if (newStatus === currentStatus) return

    setIsUpdating(true)
    setError(null)
    const result = await updateVendorOrderStatus(orderId, newStatus)

    if (result.error) {
      setError(result.error)
      // revert select visual state on error
      e.target.value = currentStatus
    } else {
      setStatus(newStatus)
    }
    setIsUpdating(false)
  }

  if (allowedNext.length === 0) {
    return <span className="font-semibold text-gray-900 capitalize">{currentStatus} (Final)</span>
  }

  return (
    <div>
      <select
        value={status}
        onChange={handleChange}
        disabled={isUpdating}
        className="block w-full max-w-xs rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 bg-white disabled:opacity-50"
      >
        <option value={currentStatus} disabled>{currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}</option>
        {allowedNext.map(opt => (
          <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>
        ))}
      </select>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
