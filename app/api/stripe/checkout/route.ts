import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

const stripeSecret = process.env.STRIPE_SECRET_KEY
const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: '2023-10-16' as any }) : null

export async function POST(req: Request) {
  try {
    if (!stripe) return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 })

    const supabase = await createClient()
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { orderId } = await req.json()
    const { data: order, error } = await supabase.from('orders').select('id, total, status, payment_status, currency').eq('id', orderId).eq('user_id', userData.user.id).single()

    if (error || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (order.payment_status === 'paid') return NextResponse.json({ error: 'Already paid' }, { status: 400 })

    const amountInCents = Math.round(order.total * 100)
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price_data: { currency: order.currency.toLowerCase(), product_data: { name: `Order ${order.id.slice(0, 8)}` }, unit_amount: amountInCents }, quantity: 1 }],
      mode: 'payment',
      metadata: { orderId: order.id, userId: userData.user.id },
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/order-success/${order.id}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/account/orders`,
      expires_at: Math.floor(Date.now() / 1000) + (30 * 60)
    })

    await supabase.from('payments').insert({ order_id: order.id, provider: 'stripe', provider_checkout_session_id: session.id, status: 'pending', amount: order.total, currency: order.currency })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
