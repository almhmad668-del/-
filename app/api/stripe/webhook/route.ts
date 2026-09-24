import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

// We need an admin/service role client here because webhooks are unauthenticated server-to-server calls
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

const stripeSecret = process.env.STRIPE_SECRET_KEY
const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: '2023-10-16' as any }) : null

export async function POST(req: Request) {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe configuration missing.' }, { status: 500 })
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  let event: Stripe.Event

  try {
    const rawBody = await req.text()
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    // 1. Enforce Webhook Idempotency using the stripe_webhook_events table
    const { error: idempotencyError } = await supabase
      .from('stripe_webhook_events')
      .insert({ provider_event_id: event.id, event_type: event.type })

    if (idempotencyError) {
      if (idempotencyError.code === '23505') { // Unique constraint violation
        console.log(`Webhook event ${event.id} already processed. Acknowledging safely.`)
        return NextResponse.json({ received: true })
      }
      throw idempotencyError
    }

    // 2. Process Event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      await handleCheckoutCompleted(session)
    } else if (event.type === 'checkout.session.expired') {
      const session = event.data.object as Stripe.Checkout.Session
      await handleCheckoutExpired(session)
    }

    // Additional events (payment_intent.payment_failed, etc.) can be added here following the same pattern.
    // For Phase 10, checkout.session.completed and .expired are the critical anchors.

    // 3. Mark processed
    await supabase.from('stripe_webhook_events').update({ processed_at: new Date().toISOString() }).eq('provider_event_id', event.id)

    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error('Webhook processing failed:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // We use the checkout session ID to map back to our payment intent.
  const { data: payment } = await supabase
    .from('payments')
    .select('id, order_id, status')
    .eq('provider_checkout_session_id', session.id)
    .single()

  if (!payment) {
    console.error(`Payment not found for session ${session.id}`)
    return
  }

  // Prevent double processing if already paid
  if (payment.status === 'paid') return

  // 1. Mark Payment successful
  await supabase.from('payments').update({ status: 'paid' }).eq('id', payment.id)

  // 2. Mark Master Order Paid
  await supabase.from('orders').update({ payment_status: 'paid', status: 'confirmed' }).eq('id', payment.order_id)

  // 3. Mark Vendor Orders processing (eligible for fulfillment)
  await supabase.from('vendor_orders').update({ status: 'processing' }).eq('order_id', payment.order_id)

  // NOTE: Inventory was ALREADY deducted during checkout_cart.
  // It is now permanently committed. We do not deduct again.
}

async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  // Safely restore inventory natively via the atomic Postgres RPC
  const { error } = await supabase.rpc('handle_expired_checkout', {
    p_checkout_session_id: session.id
  })

  if (error) {
    console.error(`Failed to handle expired checkout for session ${session.id}:`, error.message)
    throw error // Let the webhook error out to trigger a retry if it's a transient failure
  }
}
