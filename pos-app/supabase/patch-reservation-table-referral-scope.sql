BEGIN;

CREATE OR REPLACE FUNCTION public.single_reservation_table_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE t public.tables; ids uuid[]; dining interval; buffer interval; starts timestamptz; ends timestamptz;
BEGIN
  IF NEW.status NOT IN ('pending','confirmed','late','checked_in') THEN RETURN NEW; END IF;
  ids := array_remove(ARRAY[NEW.table_id,NEW.secondary_table_id,NEW.tertiary_table_id],NULL);
  IF cardinality(ids)=0 THEN RETURN NEW; END IF;
  IF cardinality(ids)<>(SELECT count(DISTINCT id) FROM unnest(ids) id) THEN RAISE EXCEPTION 'Select distinct tables'; END IF;
  IF TG_OP='UPDATE' AND OLD.status IN ('pending','confirmed','late','checked_in') AND (NEW.status=OLD.status OR NEW.status<>'checked_in') AND NEW.reserved_at IS NOT DISTINCT FROM OLD.reserved_at
    AND NEW.party_size IS NOT DISTINCT FROM OLD.party_size AND (
      (NEW.table_id IS NOT DISTINCT FROM OLD.table_id AND NEW.secondary_table_id IS NOT DISTINCT FROM OLD.secondary_table_id AND NEW.tertiary_table_id IS NOT DISTINCT FROM OLD.tertiary_table_id)
      OR (OLD.status='checked_in' AND ids <@ array_remove(ARRAY[OLD.table_id,OLD.secondary_table_id,OLD.tertiary_table_id],NULL))) THEN RETURN NEW; END IF;
  PERFORM 1 FROM public.tables WHERE id=ANY(ids) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.tables WHERE id=ANY(ids))<>cardinality(ids) THEN RAISE EXCEPTION 'Table not found'; END IF;
  IF NEW.status='checked_in' AND EXISTS(SELECT 1 FROM public.reservations r WHERE r.id<>NEW.id AND r.status='checked_in'
    AND ids && ARRAY[r.table_id,r.secondary_table_id,r.tertiary_table_id]) THEN
    RAISE EXCEPTION 'Table already has a checked-in reservation. Complete the current visit first.';
  END IF;
  IF auth.role()='service_role' AND (
    (NEW.status<>'checked_in' AND current_setting('app.reservation_assignment_override',true)=NEW.id::text)
    OR (NEW.status='checked_in' AND current_setting('app.reservation_check_in_override',true)=NEW.id::text)) THEN RETURN NEW; END IF;
  SELECT make_interval(mins=>reservation_duration_minutes),make_interval(mins=>reservation_buffer_minutes)
    INTO dining,buffer FROM public.settings ORDER BY id LIMIT 1;
  dining:=coalesce(dining,interval '90 minutes'); buffer:=coalesce(buffer,interval '15 minutes');
  starts:=CASE WHEN NEW.status='checked_in' THEN clock_timestamp() ELSE NEW.reserved_at END; ends:=starts+dining;
  FOR t IN SELECT * FROM public.tables WHERE id=ANY(ids) ORDER BY id LOOP
    IF t.availability_blocked THEN RAISE EXCEPTION 'Table is unavailable'; END IF;
    IF NEW.status<>'checked_in' AND t.status<>'empty' AND ends>now()
      AND (t.occupied_at IS NULL OR t.occupied_at+dining<=now() OR t.occupied_at+dining>starts) THEN
      RAISE EXCEPTION 'Table is occupied during the requested seating period';
    END IF;
    IF EXISTS(SELECT 1 FROM public.reservations r WHERE r.id<>NEW.id
      AND r.status IN ('pending','confirmed','late','checked_in') AND t.id IN(r.table_id,r.secondary_table_id,r.tertiary_table_id)
      AND ((r.status='checked_in' AND (r.checked_in_at IS NULL OR r.checked_in_at+dining<=now() OR r.checked_in_at+dining>starts))
        OR (r.status<>'checked_in' AND r.reserved_at-buffer<ends AND r.reserved_at+dining>starts))) THEN
      RAISE EXCEPTION 'Table is already reserved for this seating period';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_in_reservation_tables(
  p_reservation uuid,p_tables uuid[],p_party integer,p_business uuid,p_staff uuid,p_override boolean,p_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.reservations; seated timestamptz:=clock_timestamp(); dining interval; buffer interval; previous_scope text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required'; END IF;
  IF p_business IS NULL OR NOT EXISTS(SELECT 1 FROM public.businesses WHERE id=p_business) THEN RAISE EXCEPTION 'Business session required'; END IF;
  IF p_tables IS NULL OR cardinality(p_tables) NOT BETWEEN 1 AND 3 OR array_position(p_tables,NULL) IS NOT NULL
    OR cardinality(p_tables)<>(SELECT count(DISTINCT id) FROM unnest(p_tables) id) OR p_party IS NULL OR p_party<1 THEN
    RAISE EXCEPTION 'Select one to three distinct tables and a valid guest count';
  END IF;
  SELECT * INTO r FROM public.reservations WHERE id=p_reservation FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found'; END IF;
  IF r.status='checked_in' AND p_tables=array_remove(ARRAY[r.table_id,r.secondary_table_id,r.tertiary_table_id],NULL) THEN RETURN r.id; END IF;
  IF r.status NOT IN ('pending','confirmed','late') THEN RAISE EXCEPTION 'Reservation cannot be checked in'; END IF;
  PERFORM 1 FROM public.tables WHERE id=ANY(p_tables) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.tables WHERE id=ANY(p_tables))<>cardinality(p_tables) THEN RAISE EXCEPTION 'Table not found'; END IF;
  IF EXISTS(SELECT 1 FROM public.tables WHERE id=ANY(p_tables) AND status<>'empty') THEN
    RAISE EXCEPTION 'Table is occupied. Select available tables.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.reservations b WHERE b.id<>r.id AND b.status='checked_in'
    AND p_tables && ARRAY[b.table_id,b.secondary_table_id,b.tertiary_table_id]) THEN
    RAISE EXCEPTION 'Table already has a checked-in reservation. Complete the current visit first.';
  END IF;
  SELECT make_interval(mins=>reservation_duration_minutes),make_interval(mins=>reservation_buffer_minutes)
    INTO dining,buffer FROM public.settings WHERE business_id=p_business LIMIT 1;
  dining:=coalesce(dining,interval '90 minutes'); buffer:=coalesce(buffer,interval '15 minutes');
  IF NOT coalesce(p_override,false) THEN
    IF EXISTS(SELECT 1 FROM public.tables WHERE id=ANY(p_tables) AND availability_blocked) THEN RAISE EXCEPTION 'Table is unavailable'; END IF;
    IF EXISTS(SELECT 1 FROM public.reservations b WHERE b.id<>r.id AND b.status IN ('pending','confirmed','late')
      AND p_tables && ARRAY[b.table_id,b.secondary_table_id,b.tertiary_table_id]
      AND b.reserved_at-buffer<seated+dining AND b.reserved_at+dining>seated) THEN RAISE EXCEPTION 'Table is reserved for another seating'; END IF;
  END IF;
  previous_scope:=current_setting('app.reservation_check_in_override',true);
  PERFORM set_config('app.reservation_check_in_override',p_reservation::text,true);
  UPDATE public.tables SET status='waiting',occupied_at=seated,payment_status='unpaid',fulfillment_status='in_progress' WHERE id=ANY(p_tables);
  UPDATE public.reservations SET status='checked_in',table_id=p_tables[1],secondary_table_id=p_tables[2],tertiary_table_id=p_tables[3],
    actual_party_size=p_party,checked_in_at=seated,updated_at=seated,staff_override_capacity=coalesce(p_override,false),
    capacity_warnings=CASE WHEN p_override THEN concat_ws(E'\n',nullif(capacity_warnings,''),
      format('[%s] Multi-table check-in override, business %s, staff %s: %s',seated,p_business,coalesce(p_staff::text,'reception'),left(p_reason,2000))) ELSE capacity_warnings END
    WHERE id=r.id;
  PERFORM set_config('app.reservation_check_in_override',coalesce(previous_scope,''),true);
  RETURN r.id;
END;
$$;
REVOKE ALL ON FUNCTION public.check_in_reservation_tables(uuid,uuid[],integer,uuid,uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_reservation_tables(uuid,uuid[],integer,uuid,uuid,boolean,text) TO service_role;

CREATE OR REPLACE FUNCTION public.referral_sale_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a referral_attributions; c referral_codes; eligible boolean; used boolean; visit timestamptz; next_installment integer; scope_table uuid;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.referral_code_id IS NULL THEN
   IF NEW.referral_code_id IS NOT NULL OR NEW.referral_snapshot IS NOT NULL THEN RAISE EXCEPTION 'Cannot attach a referral retroactively to a payment.'; END IF;
   RETURN NEW;
  END IF;
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Referral payment adjustments require authorized staff.'; END IF;
  PERFORM 1 FROM referral_codes WHERE id=OLD.referral_code_id FOR UPDATE;
  NEW.referral_code_id:=OLD.referral_code_id; NEW.referral_snapshot:=OLD.referral_snapshot;
  NEW.referral_payment_key:=OLD.referral_payment_key; NEW.reservation_id:=OLD.reservation_id;
  NEW.referral_discount_percent:=OLD.referral_discount_percent;
  NEW.referral_discount_amount:=OLD.referral_discount_amount;
  IF NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount THEN
   NEW.referral_discount_amount:=least(NEW.discount_amount,round(coalesce(OLD.referral_discount_amount*NEW.subtotal/nullif(OLD.subtotal,0),0),2));
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.reservation_id IS NULL THEN
  SELECT r.id INTO NEW.reservation_id FROM reservations r WHERE r.status='checked_in' AND NEW.table_id IN (r.table_id,r.secondary_table_id,r.tertiary_table_id) ORDER BY r.checked_in_at ASC NULLS LAST,r.id ASC LIMIT 1;
 END IF;
 SELECT * INTO a FROM referral_attributions WHERE reservation_id=NEW.reservation_id;
 IF NOT FOUND THEN
  IF NEW.referral_code_id IS NOT NULL OR NEW.referral_snapshot IS NOT NULL THEN RAISE EXCEPTION 'Unknown referral attribution.'; END IF;
  RETURN NEW;
 END IF;
 SELECT coalesce((SELECT coalesce(nullif(s.referral_snapshot->>'discount_table_id','')::uuid,s.table_id) FROM sales s WHERE s.reservation_id=NEW.reservation_id AND s.referral_code_id IS NOT NULL ORDER BY s.closed_at,s.id LIMIT 1),
   (SELECT r.table_id FROM reservations r WHERE r.id=NEW.reservation_id)) INTO scope_table;
 IF NEW.table_id IS DISTINCT FROM scope_table AND (coalesce(NEW.referral_discount_amount,0)>0 OR coalesce(NEW.referral_discount_percent,0)>0) THEN
  RAISE EXCEPTION 'Referral discount applies to one table only. Merge tables before payment for a combined bill.';
 END IF;
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Referral payments require the secure checkout action.'; END IF;
 IF NEW.referral_payment_key IS NULL THEN RAISE EXCEPTION 'Referral payment idempotency key is required.'; END IF;
 SELECT * INTO c FROM referral_codes WHERE id=a.code_id FOR UPDATE;
 IF c.updated_at IS DISTINCT FROM NEW.referral_code_version THEN RAISE EXCEPTION 'Referral changed. Refresh checkout.'; END IF;
 SELECT occupied_at INTO visit FROM tables WHERE id=NEW.table_id FOR UPDATE;
 IF visit IS NULL THEN SELECT created_at INTO visit FROM order_items WHERE table_id=NEW.table_id ORDER BY created_at LIMIT 1; END IF;
 IF visit IS NULL THEN SELECT checked_in_at INTO visit FROM reservations WHERE id=NEW.reservation_id; END IF;
 IF visit IS DISTINCT FROM NEW.seated_at THEN RAISE EXCEPTION 'Table visit changed. Refresh checkout.'; END IF;
 SELECT coalesce(max(referral_installment),0)+1 INTO next_installment FROM sales WHERE table_id=NEW.table_id AND seated_at IS NOT DISTINCT FROM visit;
 IF NEW.referral_installment IS DISTINCT FROM next_installment THEN RAISE EXCEPTION 'Another payment was recorded. Refresh checkout.'; END IF;

 SELECT EXISTS(SELECT 1 FROM referral_redemptions WHERE reservation_id=NEW.reservation_id) INTO used;
 eligible:=c.active AND (c.expires_at IS NULL OR c.expires_at>now()) AND (used OR c.usage_limit IS NULL OR c.usage_count<c.usage_limit)
  AND coalesce(NEW.referral_visit_subtotal,0)>=(a.rules->>'min_spend')::numeric;
 IF NOT eligible AND coalesce(NEW.referral_discount_percent,0)>0 AND nullif(NEW.referral_override_reason,'') IS NULL THEN RAISE EXCEPTION 'Referral eligibility changed. Refresh checkout.'; END IF;
 NEW.referral_code_id:=a.code_id;
 NEW.referral_snapshot:=jsonb_build_object('eligible',eligible,'business_id',a.business_id,'code',a.rules->>'code','partner_name',a.rules->>'partner_name','discount_table_id',scope_table);
 IF eligible AND NOT used THEN
  INSERT INTO referral_redemptions(reservation_id,code_id,visit_subtotal) VALUES(NEW.reservation_id,c.id,NEW.referral_visit_subtotal);
  UPDATE referral_codes SET usage_count=usage_count+1 WHERE id=c.id;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.override_reservation_check_in(
  p_reservation uuid, p_table uuid, p_party integer, p_staff uuid, p_business uuid, p_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.reservations; t public.tables; previous_scope text; seated timestamptz := clock_timestamp();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required'; END IF;
  IF p_business IS NULL OR NOT EXISTS (SELECT 1 FROM public.businesses WHERE id = p_business) THEN
    RAISE EXCEPTION 'Business session required';
  END IF;
  -- Staff identity is optional audit metadata. Any reception device signed into
  -- the business may confirm check-in, regardless of staff login or role.
  IF p_staff IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.staff
    WHERE id = p_staff AND business_id = p_business AND active) THEN p_staff := NULL; END IF;
  IF p_party IS NULL OR p_party < 1 OR nullif(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Valid guest count and override reason are required'; END IF;
  SELECT * INTO r FROM public.reservations WHERE id = p_reservation FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found'; END IF;
  IF r.status = 'checked_in' AND r.table_id = p_table THEN RETURN r.id; END IF;
  IF r.status NOT IN ('pending', 'confirmed', 'late') THEN RAISE EXCEPTION 'Reservation cannot be checked in'; END IF;
  SELECT * INTO t FROM public.tables WHERE id = p_table FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Table not found'; END IF;
  IF t.status <> 'empty' THEN RAISE EXCEPTION 'Table is occupied. Complete the current visit before checking in another party.'; END IF;
  IF EXISTS (SELECT 1 FROM public.reservations b WHERE b.id <> r.id AND b.status = 'checked_in'
    AND p_table IN (b.table_id, b.secondary_table_id, b.tertiary_table_id)) THEN
    RAISE EXCEPTION 'Table already has a checked-in reservation. Complete the current visit first.';
  END IF;
  previous_scope := current_setting('app.reservation_check_in_override', true);
  PERFORM set_config('app.reservation_check_in_override', p_reservation::text, true);
  UPDATE public.tables SET status = 'waiting', occupied_at = seated,
    payment_status = 'unpaid', fulfillment_status = 'in_progress' WHERE id = p_table;
  UPDATE public.reservations SET status = 'checked_in', table_id = p_table, secondary_table_id = NULL,
    tertiary_table_id = NULL, actual_party_size = p_party, checked_in_at = seated,
    staff_override_capacity = true,
    capacity_warnings = concat_ws(E'\n', nullif(r.capacity_warnings, ''),
      format('[%s] Check-in override by %s (business %s), table %s (prior status %s): %s',
        seated, coalesce(p_staff::text, 'reception device (no staff login)'), p_business, p_table, t.status, left(p_reason, 2000))),
    updated_at = seated WHERE id = p_reservation;
  PERFORM set_config('app.reservation_check_in_override', coalesce(previous_scope, ''), true);
  RETURN p_reservation;
END;
$$;
REVOKE ALL ON FUNCTION public.override_reservation_check_in(uuid, uuid, integer, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.override_reservation_check_in(uuid, uuid, integer, uuid, uuid, text)
  TO service_role;

COMMIT;
