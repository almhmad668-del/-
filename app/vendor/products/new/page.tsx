import ProductForm from '../components/ProductForm'

export default function NewProductPage() {
  return (
    <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
      <div className="mb-8 border-b pb-4">
        <h2 className="text-xl font-semibold text-gray-900">Add New Product</h2>
        <p className="mt-1 text-sm text-gray-500">Create a new product listing in your catalog.</p>
      </div>
      <ProductForm />
    </div>
  )
}
