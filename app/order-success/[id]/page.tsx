import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function OrderSuccessPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) redirect('/login')

  // Verify ownership via RLS and query payment state
  const { data: order } = await supabase
    .from('orders')
    .select('id, total, status, payment_status')
    .eq('id', resolvedParams.id)
    .single()

  if (!order) {
    redirect('/')
  }

  // Phase 10: Server-side validation of the actual payment status
  const isPaid = order.payment_status === 'paid'
  const isPending = order.payment_status === 'pending'
  const isFailed = order.payment_status === 'failed' || order.payment_status === 'refunded'

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
      <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">

        {isPaid && (
          <svg className="mx-auto h-16 w-16 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        )}
        {isPending && (
          <svg className="mx-auto h-16 w-16 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        {isFailed && (
          <svg className="mx-auto h-16 w-16 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}

        <h1 className="mt-4 text-3xl font-extrabold text-gray-900 tracking-tight">
          {isPaid && 'Payment Successful!'}
          {isPending && 'Payment Processing'}
          {isFailed && 'Payment Failed'}
        </h1>

        <p className="mt-2 text-base text-gray-500">
          {isPaid && `Thank you for your purchase. Your order number is `}
          {isPending && `We are waiting for payment confirmation from Stripe. Your order number is `}
          {isFailed && `Your payment was not successful. Your order number is `}
          <span className="font-mono text-gray-900">{order.id.slice(0, 8)}...</span>
        </p>

        {isFailed && (
          <div className="mt-4">
            <Link href="/account/orders" className="text-sm font-medium text-red-600 hover:text-red-500 underline">
              Please go to your Order History to retry payment.
            </Link>
          </div>
        )}
        <div className="mt-8 border-t pt-8 text-left max-w-md mx-auto">
          <dl className="space-y-2">
             <div className="flex justify-between">
                <dt className="text-sm font-medium text-gray-500">Total Amount</dt>
                <dd className="text-sm font-medium text-gray-900">${order.total}</dd>
             </div>
             <div className="flex justify-between">
                <dt className="text-sm font-medium text-gray-500">Status</dt>
                <dd className="text-sm font-medium text-gray-900 capitalize">{order.status}</dd>
             </div>
          </dl>
        </div>
        <div className="mt-10 flex justify-center space-x-4">
          <Link href="/account/orders" className="text-sm font-medium text-blue-600 hover:text-blue-500">
            View Order History &rarr;
          </Link>
          <Link href="/" className="text-sm font-medium text-gray-600 hover:text-gray-500">
            Continue Shopping
          </Link>
        </div>
      </div>
    </main>
  )
}
