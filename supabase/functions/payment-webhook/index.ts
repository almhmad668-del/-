import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

// Interface representing the expected payload from Cham Cash
interface ChamCashWebhook {
  transaction_id: string; // The unique event ID for idempotency
  order_id: string;       // Our internal UUID
  status: 'success' | 'failed';
  amount: number;
}

serve(async (req: Request) => {
  try {
    // 1. Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 2. Parse the incoming JSON payload
    const payload: ChamCashWebhook = await req.json()

    // Validate required fields
    if (!payload.transaction_id || !payload.order_id || !payload.status) {
      return new Response(JSON.stringify({ error: 'Missing required webhook fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // --- SECURITY OVERRIDE: DEVELOPMENT PLACEHOLDER ---
    // The payment integration is currently NOT production safe.
    // We cannot trust client-provided statuses without signature verification.

    console.warn(`[SECURITY] Blocked unverified payment webhook attempt for order ${payload.order_id}`);

    return new Response(JSON.stringify({
      error: 'Payment webhook is currently in development mode. Real transactions are disabled until signature verification is implemented.'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })

    /*
    // TODO: Implement signature verification before re-enabling this logic.
    //
    // if (!verifySignature(req.headers.get('x-signature'))) throw Error('Invalid signature');
    //
    // if (payload.status !== 'success') { ... }
    //
    // const supabase = createClient(...)
    // const { data, error } = await supabase.rpc('finalize_payment', ...)
    // ...
    */

  } catch (err) {
    console.error('Webhook processing error:', err)
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
