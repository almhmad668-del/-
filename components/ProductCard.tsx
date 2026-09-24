import Link from 'next/link'

interface ProductCardProps {
  product: {
    id: string
    name: string
    slug: string
    price: number
    currency: string
    main_image_url: string | null
    vendors: {
      store_name: string
    } | null
  }
}

export default function ProductCard({ product }: ProductCardProps) {
  return (
    <div className="group relative border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-white flex flex-col h-full">
      <div className="aspect-h-1 aspect-w-1 w-full overflow-hidden bg-gray-200 lg:aspect-none lg:h-64">
        {product.main_image_url ? (
          <img
            src={product.main_image_url}
            alt={product.name}
            className="h-full w-full object-cover object-center lg:h-full lg:w-full"
          />
        ) : (
          <div className="flex items-center justify-center h-full w-full bg-gray-100 text-gray-400">
            No image
          </div>
        )}
      </div>
      <div className="p-4 flex flex-col flex-1">
        <h3 className="text-sm text-gray-700 font-medium">
          {/* We wrap the whole card visually, but use an empty link here or wrap the title */}
          {/* Real PDP navigation would go here in future phases */}
          <span aria-hidden="true" className="absolute inset-0" />
          {product.name}
        </h3>
        <p className="mt-1 text-xs text-gray-500">{product.vendors?.store_name || 'Unknown Store'}</p>
        <div className="mt-auto pt-2 flex justify-between items-center">
          <p className="text-sm font-semibold text-gray-900">
            {product.price} {product.currency}
          </p>
        </div>
      </div>
    </div>
  )
}
