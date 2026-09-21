import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

serve(async (req: Request) => {
  try {
    // 1. Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 2. Parse the incoming JSON payload (assuming transaction_id and order_id)
    const payload = await req.json()
    const { transaction_id, order_id } = payload

    if (!transaction_id || !order_id) {
      return new Response(JSON.stringify({ error: 'Missing transaction_id or order_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 3. Initialize the Supabase Client with the Service Role Key
    // This allows the function to bypass RLS and securely call the RPC
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // 4. Call the idempotent RPC function
    const { data, error } = await supabase.rpc('finalize_payment', {
      p_order_id: order_id,
      p_event_id: transaction_id,
    })

    if (error) {
      console.error('RPC Error:', error)
      return new Response(JSON.stringify({ error: 'Database error finalizing payment' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // If the data object indicates it was already processed, still return 200 OK
    // to acknowledge the webhook and stop the provider from retrying.
    if (data && data.already_processed) {
      console.log(`Webhook already processed for event: ${transaction_id}`)
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 5. Return Success
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
