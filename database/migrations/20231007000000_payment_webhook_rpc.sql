-- 1. Create the RPC for finalizing payments idempotently
CREATE OR REPLACE FUNCTION public.finalize_payment(p_order_id UUID, p_event_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order RECORD;
BEGIN
  -- Step A: Idempotency Check
  -- Attempt to insert the event_id. If it exists, the unique constraint will trigger an exception.
  BEGIN
    INSERT INTO public.processed_webhooks (event_id) VALUES (p_event_id);
  EXCEPTION WHEN unique_violation THEN
    -- Gracefully exit if the webhook was already processed
    RETURN json_build_object('success', false, 'message', 'Webhook already processed.', 'already_processed', true);
  END;

  -- Step B: Verify the order exists
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- If it's already paid or cancelled, we shouldn't process a payment success again (defensive check)
  IF v_order.status IN ('paid', 'cancelled', 'refunded') THEN
    RETURN json_build_object('success', false, 'message', 'Order is already in a final state.', 'already_processed', true);
  END IF;

  -- Step C: Update Main Order Status
  UPDATE public.orders
  SET status = 'paid'::public.order_status
  WHERE id = p_order_id;

  -- Step D: Update Vendor Sub-Orders Status
  UPDATE public.vendor_orders
  SET status = 'paid'::public.order_status
  WHERE order_id = p_order_id;

  -- Step E: Optionally update the ledger entries from pending to completed
  -- For this scope, if we want to release the funds:
  UPDATE public.ledger_entries
  SET status = 'completed'::public.ledger_status
  WHERE reference_id IN (SELECT id FROM public.vendor_orders WHERE order_id = p_order_id);

  RETURN json_build_object('success', true, 'message', 'Payment finalized successfully.');
END;
$$;

-- Secure the RPC: Prevent direct client invocation via PostgREST
-- Only the service_role (e.g. Edge Functions) is allowed to execute this.
REVOKE EXECUTE ON FUNCTION public.finalize_payment(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_payment(UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_payment(UUID, TEXT) TO service_role;
