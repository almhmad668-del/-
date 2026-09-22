'use client'

import { useState, useMemo } from 'react'

interface OptionValue {
  id: string
  value: string
}

interface Option {
  id: string
  name: string
  values: OptionValue[]
}

interface Variant {
  id: string
  price: number
  compare_at_price: number | null
  stock_quantity: number
  image_url: string | null
  valueIds: string[]
}

interface VariantSelectorProps {
  options: Option[]
  variants: Variant[]
  basePrice: number
  currency: string
}

export default function VariantSelector({ options, variants, basePrice, currency }: VariantSelectorProps) {
  // Map of optionId -> selected optionValueId
  const [selectedValues, setSelectedValues] = useState<Record<string, string>>({})

  // Find if there is a matching variant for the current selection
  const selectedVariant = useMemo(() => {
    if (variants.length === 0) return null

    const selectedIds = Object.values(selectedValues)
    if (selectedIds.length !== options.length) return null // not fully selected

    return variants.find(v => {
      // Variant must contain ALL selected value IDs
      return selectedIds.every(id => v.valueIds.includes(id)) && v.valueIds.length === selectedIds.length
    }) || null
  }, [selectedValues, variants, options])

  const handleSelect = (optionId: string, valueId: string) => {
    setSelectedValues(prev => ({
      ...prev,
      [optionId]: valueId
    }))
  }

  // Calculate Display Price & Stock
  const displayPrice = selectedVariant ? selectedVariant.price : basePrice
  const displayCompareAt = selectedVariant?.compare_at_price
  const isOutOfStock = selectedVariant ? selectedVariant.stock_quantity <= 0 : false

  return (
    <div className="space-y-6">
      {/* Price Display */}
      <div className="flex items-center space-x-4">
        <p className="text-3xl text-gray-900 font-bold">
          {displayPrice} {currency}
        </p>
        {displayCompareAt && (
          <p className="text-xl text-gray-500 line-through">
            {displayCompareAt} {currency}
          </p>
        )}
      </div>

      {/* Stock Availability */}
      <div>
        {variants.length > 0 && Object.keys(selectedValues).length < options.length ? (
          <p className="text-sm text-gray-500">Please select all options</p>
        ) : isOutOfStock ? (
          <p className="text-sm font-medium text-red-600">Out of Stock</p>
        ) : (
          <p className="text-sm font-medium text-green-600">In Stock</p>
        )}
      </div>

      {/* Options */}
      {options.map(option => (
        <div key={option.id}>
          <h3 className="text-sm text-gray-900 font-medium mb-2">{option.name}</h3>
          <div className="flex flex-wrap gap-2">
            {option.values.map(val => {
              const isSelected = selectedValues[option.id] === val.id
              return (
                <button
                  key={val.id}
                  onClick={() => handleSelect(option.id, val.id)}
                  className={`
                    border rounded-md py-2 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                    ${isSelected
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-50'}
                  `}
                >
                  {val.value}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {/* Fake Add to Cart (Phase 6 requirement: Do not implement actual cart) */}
      <div className="mt-8 flex">
        <button
          type="button"
          disabled={isOutOfStock || (variants.length > 0 && Object.keys(selectedValues).length < options.length)}
          className="flex-1 max-w-xs bg-blue-600 border border-transparent rounded-md py-3 px-8 flex items-center justify-center text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-50 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => alert("Add to Cart functionality is not implemented in this phase.")}
        >
          Add to Cart
        </button>
      </div>
    </div>
  )
}
