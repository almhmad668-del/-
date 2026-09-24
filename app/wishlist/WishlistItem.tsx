'use client'

import { useState } from 'react'
import { toggleWishlistItem } from '@/app/actions/wishlistActions'
import Link from 'next/link'

interface WishlistItemProps {
  item: {
    id: string
    name: string
    slug: string
    vendorName: string
    price: number
    image: string | null
    isPurchasable: boolean
    stock: number
  }
}

export default function WishlistItem({ item }: WishlistItemProps) {
  const [isRemoving, setIsRemoving] = useState(false)

  const handleRemove = async (e: React.MouseEvent) => {
    e.preventDefault() // prevent navigating if wrapped in a link
    setIsRemoving(true)
    await toggleWishlistItem(item.id)
    setIsRemoving(false)
  }

  return (
    <div className={`group relative border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-white flex flex-col h-full ${!item.isPurchasable ? 'opacity-75 grayscale' : ''}`}>
      <div className="aspect-h-1 aspect-w-1 w-full overflow-hidden bg-gray-200 lg:aspect-none lg:h-64">
        {item.image ? (
          <img src={item.image} alt={item.name} className="h-full w-full object-cover object-center lg:h-full lg:w-full" />
        ) : (
          <div className="flex items-center justify-center h-full w-full bg-gray-100 text-gray-400">No image</div>
        )}
        <button
          onClick={handleRemove}
          disabled={isRemoving}
          className="absolute top-2 right-2 p-2 bg-white rounded-full shadow hover:bg-gray-50 text-red-500"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
      <div className="p-4 flex flex-col flex-1">
        <h3 className="text-sm text-gray-700 font-medium">
          <Link href={`/products/${item.slug}`}>
            <span aria-hidden="true" className="absolute inset-0" />
            {item.name}
          </Link>
        </h3>
        <p className="mt-1 text-xs text-gray-500">{item.vendorName}</p>
        <div className="mt-auto pt-2 flex justify-between items-center">
          <p className="text-sm font-semibold text-gray-900">${item.price}</p>
          {!item.isPurchasable ? (
            <span className="text-xs text-red-600 font-medium">Unavailable</span>
          ) : item.stock <= 0 ? (
            <span className="text-xs text-red-600 font-medium">Out of stock</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
