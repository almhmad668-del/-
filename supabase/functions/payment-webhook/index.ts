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

    // 3. Logic Flow: Handle non-success statuses immediately
    if (payload.status !== 'success') {
      console.log(`Payment failed or pending for order ${payload.order_id}. Status: ${payload.status}`)
      // Return 200 OK so the provider knows we received it and doesn't retry
      return new Response(JSON.stringify({ message: 'Webhook received, no action taken due to status.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 4. Initialize the Supabase Client with the Service Role Key
    // This allows the function to bypass RLS and securely execute the RPC
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // 5. Call the idempotent RPC function
    const { data, error } = await supabase.rpc('finalize_payment', {
      p_order_id: payload.order_id,
      p_event_id: payload.transaction_id,
    })

    // 6. Error Handling & Idempotency Responses
    if (error) {
      console.error('RPC Error:', error)

      // Catch specific PostgreSQL unique constraint violation (code 23505) if the RPC throws it
      // Note: Our RPC currently handles this internally and returns a success object with already_processed: true,
      // but this acts as a robust fallback just in case the RPC is modified to throw the error instead.
      if (error.code === '23505') {
        console.log(`Webhook already processed (caught via 23505) for event: ${payload.transaction_id}`)
        return new Response(JSON.stringify({ message: 'Webhook already processed' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ error: 'Database error finalizing payment' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Handle idempotency from our specific RPC logic (returns 200)
    if (data && data.already_processed) {
      console.log(`Webhook already processed (caught via RPC data) for event: ${payload.transaction_id}`)
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Return Success
    console.log(`Payment finalized successfully for order ${payload.order_id}`)
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Webhook processing error:', err)
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
