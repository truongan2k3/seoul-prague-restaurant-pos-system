BEGIN;

ALTER TABLE public.voucher_orders ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Preserve the original cancellation time for existing orders, including today's orders.
UPDATE public.voucher_orders o SET cancelled_at = coalesce(
  (SELECT min(a.created_at) FROM public.voucher_audit_logs a
    WHERE a.order_uuid = o.id AND a.action = 'cancelled'), o.updated_at)
WHERE o.payment_status = 'cancelled' AND o.cancelled_at IS NULL;

CREATE OR REPLACE FUNCTION public.stamp_voucher_cancellation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.cancelled_at IS NOT NULL THEN NEW.cancelled_at := OLD.cancelled_at;
  ELSIF NEW.payment_status = 'cancelled' AND OLD.payment_status IS DISTINCT FROM 'cancelled' THEN
    NEW.cancelled_at := clock_timestamp();
  ELSIF OLD.payment_status = 'cancelled' THEN NEW.cancelled_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS stamp_voucher_cancellation ON public.voucher_orders;
CREATE TRIGGER stamp_voucher_cancellation BEFORE UPDATE ON public.voucher_orders
FOR EACH ROW EXECUTE FUNCTION public.stamp_voucher_cancellation();

CREATE OR REPLACE FUNCTION public.recover_cancelled_voucher_order(
  p_order uuid, p_staff uuid, p_staff_name text, p_business uuid, p_codes text[], p_validity_days integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.voucher_orders; recovered_at timestamptz; code_expiry timestamptz; actor_name text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required'; END IF;
  PERFORM 1 FROM public.staff WHERE id = p_staff AND business_id = p_business
    AND active AND role IN ('admin', 'manager', 'cashier', 'server');
  IF NOT FOUND THEN RAISE EXCEPTION 'Unauthorized staff'; END IF;
  actor_name := coalesce(nullif(btrim(p_staff_name), ''), 'Staff');
  SELECT * INTO r FROM public.voucher_orders WHERE id = p_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  -- Concurrent taps return the existing result without issuing or emailing again.
  IF r.payment_status = 'paid' AND r.order_status IN ('issued', 'partially_redeemed', 'fully_redeemed') THEN RETURN false; END IF;
  recovered_at := clock_timestamp();
  IF r.payment_status <> 'cancelled' OR r.order_status <> 'cancelled' OR r.guest_marked_paid_at IS NOT NULL
    OR r.notes IS DISTINCT FROM 'Auto-cancelled: payment window expired' THEN
    RAISE EXCEPTION 'Only orders automatically cancelled for missing payment confirmation can be recovered';
  END IF;
  IF r.cancelled_at IS NULL OR recovered_at >= r.cancelled_at + interval '24 hours' THEN
    RAISE EXCEPTION 'The 24-hour support window has ended. This order can no longer be issued';
  END IF;
  IF EXISTS (SELECT 1 FROM public.voucher_codes WHERE order_uuid = r.id) THEN
    RAISE EXCEPTION 'Voucher codes already exist for this order. Review its history';
  END IF;
  IF p_validity_days IS NULL OR p_validity_days NOT BETWEEN 0 AND 3650 OR p_codes IS NULL
    OR cardinality(p_codes) <> r.quantity OR array_ndims(p_codes) IS DISTINCT FROM 1
    OR EXISTS (SELECT 1 FROM unnest(p_codes) c WHERE c IS NULL OR btrim(c) = '')
    OR (SELECT count(DISTINCT c) FROM unnest(p_codes) c) <> r.quantity THEN
    RAISE EXCEPTION 'Invalid voucher issue request';
  END IF;
  code_expiry := CASE WHEN p_validity_days > 0 THEN recovered_at + make_interval(days => p_validity_days) END;
  INSERT INTO public.voucher_codes (order_uuid, code, denomination_czk, status, expires_at, created_at, updated_at)
    SELECT r.id, c, r.denomination_czk, 'issued', code_expiry, recovered_at, recovered_at FROM unnest(p_codes) c;
  UPDATE public.voucher_orders SET payment_status = 'paid', order_status = 'issued',
    verified_at = recovered_at, verified_by_staff_id = p_staff::text,
    verified_by_staff_name = actor_name, issued_at = recovered_at, updated_at = recovered_at WHERE id = r.id;
  INSERT INTO public.voucher_audit_logs (order_uuid, action, staff_id, staff_name, meta, created_at) VALUES
    (r.id, 'cancelled_order_recovered', p_staff::text, actor_name,
      jsonb_build_object('cancelled_at', r.cancelled_at, 'payment_received_confirmed', true,
        'quantity', r.quantity, 'total_czk', r.total_czk), recovered_at),
    (r.id, 'payment_verified', p_staff::text, actor_name, '{"recovery":true}', recovered_at),
    (r.id, 'issued', p_staff::text, actor_name, jsonb_build_object('quantity', r.quantity, 'recovery', true), recovered_at);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.recover_cancelled_voucher_order(uuid, uuid, text, uuid, text[], integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_cancelled_voucher_order(uuid, uuid, text, uuid, text[], integer) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
