'use client'

import { useState } from 'react'
import { updateCartItemQuantity, removeCartItem } from '@/app/actions/cartActions'
import Link from 'next/link'

interface CartItemProps {
  item: {
    id: string
    quantity: number
    price: number
    stock: number
    name: string
    slug: string
    vendorName: string
    image: string | null
    variantOptions: string | null
    isPurchasable: boolean
    messages: string[]
  }
}

export default function CartItem({ item }: CartItemProps) {
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleQuantityChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newQuantity = parseInt(e.target.value, 10)
    if (newQuantity === item.quantity) return

    setIsUpdating(true)
    setError(null)
    const result = await updateCartItemQuantity(item.id, newQuantity)
    if (result.error) setError(result.error)
    setIsUpdating(false)
  }

  const handleRemove = async () => {
    setIsUpdating(true)
    await removeCartItem(item.id)
    setIsUpdating(false)
  }

  const quantityOptions = []
  // Max selectable dropdown logic: up to 10 or current stock, whichever is smaller.
  // Actually, let's just do up to stock (max 999).
  const maxDrop = Math.min(Math.max(item.stock, item.quantity), 999)
  for (let i = 1; i <= Math.min(maxDrop, 10); i++) {
    quantityOptions.push(<option key={i} value={i}>{i}</option>)
  }
  // Make sure current quantity is in the list if it's > 10
  if (item.quantity > 10) {
    quantityOptions.push(<option key={item.quantity} value={item.quantity}>{item.quantity}</option>)
  }

  return (
    <li className="flex py-6 sm:py-10">
      <div className="flex-shrink-0">
        {item.image ? (
          <img src={item.image} alt={item.name} className="w-24 h-24 rounded-md object-center object-cover sm:w-32 sm:h-32" />
        ) : (
          <div className="w-24 h-24 rounded-md bg-gray-200 sm:w-32 sm:h-32 flex items-center justify-center text-gray-500 text-xs">No Image</div>
        )}
      </div>

      <div className="ml-4 flex-1 flex flex-col justify-between sm:ml-6">
        <div className="relative pr-9 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:pr-0">
          <div>
            <div className="flex justify-between">
              <h3 className="text-sm">
                <Link href={`/products/${item.slug}`} className="font-medium text-gray-700 hover:text-gray-800">
                  {item.name}
                </Link>
              </h3>
            </div>
            <p className="mt-1 text-sm text-gray-500">{item.vendorName}</p>
            {item.variantOptions && (
              <p className="mt-1 text-sm text-gray-500">{item.variantOptions}</p>
            )}
            <p className="mt-1 text-sm font-medium text-gray-900">${item.price}</p>

            {item.messages.length > 0 && (
              <div className="mt-2 text-sm text-red-600 space-y-1">
                {item.messages.map((msg, i) => <p key={i}>{msg}</p>)}
              </div>
            )}
            {error && (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            )}
          </div>

          <div className="mt-4 sm:mt-0 sm:pr-9">
            <label htmlFor={`quantity-${item.id}`} className="sr-only">Quantity, {item.name}</label>
            <select
              id={`quantity-${item.id}`}
              name={`quantity-${item.id}`}
              disabled={isUpdating || !item.isPurchasable}
              value={item.quantity}
              onChange={handleQuantityChange}
              className="max-w-full rounded-md border border-gray-300 py-1.5 text-base leading-5 font-medium text-gray-700 text-left shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            >
              {quantityOptions}
            </select>

            <div className="absolute top-0 right-0">
              <button
                type="button"
                onClick={handleRemove}
                disabled={isUpdating}
                className="-m-2 p-2 inline-flex text-gray-400 hover:text-gray-500"
              >
                <span className="sr-only">Remove</span>
                <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </li>
  )
}
