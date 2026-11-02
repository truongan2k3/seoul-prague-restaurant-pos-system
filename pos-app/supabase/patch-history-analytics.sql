BEGIN;
CREATE INDEX IF NOT EXISTS sales_history_visit_idx ON public.sales(table_id,seated_at,closed_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS referral_commissions_sale_idx ON public.referral_commissions(sale_id,business_id);

DROP FUNCTION IF EXISTS public.history_sales_analytics(date,date,uuid,uuid,text,text,text);
CREATE OR REPLACE FUNCTION public.history_sales_analytics(
  p_from date,p_to date,p_actor uuid,p_business uuid,p_payment text DEFAULT 'all',p_code text DEFAULT NULL,p_partner text DEFAULT NULL,p_month_compare boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $history$
DECLARE actor public.staff; result jsonb; days integer; can_commission boolean; previous_from date; previous_to date;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required'; END IF;
  SELECT * INTO actor FROM public.staff WHERE id=p_actor AND business_id=p_business AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staff authorization required'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>3650 THEN RAISE EXCEPTION 'Choose a date range of up to 10 years'; END IF;
  IF p_payment NOT IN ('all','cash','card') THEN RAISE EXCEPTION 'Invalid payment filter'; END IF;
  IF actor.role NOT IN ('admin','manager','cashier') AND NOT (coalesce(to_jsonb(actor)->'allowed_nav','[]'::jsonb) ? 'history') THEN RAISE EXCEPTION 'History access required'; END IF;
  can_commission:=actor.role IN ('admin','manager','cashier'); days:=p_to-p_from+1;
  IF p_month_compare OR (p_from=date_trunc('month',p_from::timestamp)::date AND p_to=(date_trunc('month',p_from::timestamp)+interval '1 month - 1 day')::date) THEN
    previous_to:=date_trunc('month',p_from::timestamp)::date-1;
    previous_from:=date_trunc('month',previous_to::timestamp)::date;
  ELSE previous_from:=p_from-days; previous_to:=p_to-days;
  END IF;
  WITH windows AS (
    SELECT n,f,t,f::timestamp AT TIME ZONE 'Europe/Prague' starts,(t+1)::timestamp AT TIME ZONE 'Europe/Prague' ends
    FROM (VALUES(0,p_from,p_to),(1,previous_from,previous_to),(2,p_from-7,p_to-7)) x(n,f,t)
  ), bounds AS (SELECT min(starts) starts,max(ends) ends FROM windows),
  scoped AS MATERIALIZED (
    SELECT s.* FROM public.sales s,bounds b WHERE s.closed_at>=b.starts AND s.closed_at<b.ends
      AND s.payment_method IN ('cash','card') AND (p_payment='all' OR s.payment_method=p_payment)
      AND coalesce(s.referral_snapshot->>'business_id',p_business::text)=p_business::text
  ), visits AS (SELECT DISTINCT table_id,seated_at FROM scoped WHERE table_id IS NOT NULL AND seated_at IS NOT NULL),
  sessions AS (
    SELECT s.table_id,s.seated_at,(array_agg(s.id ORDER BY s.closed_at DESC,s.id DESC))[1] last_id,
      sum(greatest(0,s.subtotal-coalesce(s.discount_amount,0))) value,
      max(s.party_size) FILTER(WHERE s.party_size>0) guests
    FROM public.sales s JOIN visits v ON s.table_id=v.table_id AND s.seated_at=v.seated_at
    WHERE s.deleted_at IS NULL AND s.payment_method IN ('cash','card')
      AND coalesce(s.referral_snapshot->>'business_id',p_business::text)=p_business::text
    GROUP BY s.table_id,s.seated_at
  ), ledger AS (
    SELECT l.sale_id,count(*) entries,sum(l.amount) amount,
      (jsonb_agg(l.rules ORDER BY CASE WHEN l.kind='earned' THEN 0 ELSE 1 END,l.created_at,l.id)->0) rules
    FROM public.referral_commissions l JOIN scoped s ON s.id=l.sale_id WHERE l.business_id=p_business GROUP BY l.sale_id
  ), attributed AS (
    SELECT s.*,greatest(0,s.subtotal-coalesce(s.discount_amount,0)) net,
      coalesce(nullif(s.referral_snapshot->>'code',''),nullif(l.rules->>'code','')) code,
      coalesce(nullif(s.referral_snapshot->>'partner_name',''),nullif(l.rules->>'partner_name','')) partner,
      coalesce(s.referral_discount_amount,0) referral_discount,
      coalesce(s.referral_discount_percent,0) referral_percent,
      CASE WHEN l.entries>0 AND can_commission THEN l.amount ELSE NULL END commission,
      CASE WHEN s.table_id IS NOT NULL AND s.seated_at IS NOT NULL THEN s.table_id::text||':'||s.seated_at::text ELSE s.id::text END order_key,
      CASE WHEN se.last_id IS NULL THEN true ELSE s.id=se.last_id AND NOT EXISTS (
        SELECT 1 FROM public.tables t WHERE t.id=s.table_id AND t.occupied_at=s.seated_at
          AND t.status<>'empty' AND coalesce(t.payment_status,'unpaid')<>'paid'
      ) END completed,
      coalesce(se.value,greatest(0,s.subtotal-coalesce(s.discount_amount,0))) completed_value,
      CASE WHEN se.last_id IS NOT NULL THEN se.guests WHEN s.party_size>0 THEN s.party_size ELSE NULL END completed_guests
    FROM scoped s LEFT JOIN ledger l ON l.sale_id=s.id LEFT JOIN sessions se ON se.table_id=s.table_id AND se.seated_at=s.seated_at
  ), matched AS MATERIALIZED (
    SELECT * FROM attributed a WHERE a.deleted_at IS NULL AND (p_code IS NULL OR ((a.referral_code_id IS NOT NULL OR a.code IS NOT NULL) AND coalesce(a.code,'[unrecorded]')=p_code))
      AND (p_partner IS NULL OR ((a.referral_code_id IS NOT NULL OR a.code IS NOT NULL) AND coalesce(a.partner,'[unrecorded]')=p_partner))
  ), metadata_rows AS MATERIALIZED (
    SELECT a.* FROM attributed a,windows w WHERE w.n=0 AND a.closed_at>=w.starts AND a.closed_at<w.ends
      AND (p_code IS NULL OR ((a.referral_code_id IS NOT NULL OR a.code IS NOT NULL) AND coalesce(a.code,'[unrecorded]')=p_code))
      AND (p_partner IS NULL OR ((a.referral_code_id IS NOT NULL OR a.code IS NOT NULL) AND coalesce(a.partner,'[unrecorded]')=p_partner))
  ), current_rows AS MATERIALIZED (
    SELECT m.* FROM matched m,windows w WHERE w.n=0 AND m.closed_at>=w.starts AND m.closed_at<w.ends
  ), period_totals AS (
    SELECT w.n,w.f,w.t,count(m.id) payments,
      count(DISTINCT m.order_key) FILTER(WHERE m.completed) orders,
      coalesce(sum(m.completed_value) FILTER(WHERE m.completed),0) completed_value,
      round(sum(m.completed_value) FILTER(WHERE m.completed AND m.completed_guests>0)
        /nullif(sum(m.completed_guests) FILTER(WHERE m.completed AND m.completed_guests>0),0),2) average_per_person,
      coalesce(sum(m.subtotal),0) gross,coalesce(sum(m.net),0) revenue,
      coalesce(sum(m.discount_amount),0) discounts,coalesce(sum(m.tip),0) tips,
      coalesce(sum(m.net) FILTER(WHERE m.referral_code_id IS NOT NULL OR m.code IS NOT NULL),0) referral_revenue,
      coalesce(sum(m.referral_discount),0) referral_discounts
    FROM windows w LEFT JOIN matched m ON m.closed_at>=w.starts AND m.closed_at<w.ends GROUP BY w.n,w.f,w.t
  ), hourly AS (
    SELECT w.n,h.hour,coalesce(sum(m.net),0) revenue,count(DISTINCT m.order_key) FILTER(WHERE m.completed) orders
    FROM windows w CROSS JOIN generate_series(0,23) h(hour)
    LEFT JOIN matched m ON m.closed_at>=w.starts AND m.closed_at<w.ends AND extract(hour FROM m.closed_at AT TIME ZONE 'Europe/Prague')=h.hour
    GROUP BY w.n,h.hour
  ), daily AS (
    SELECT d::date AS sales_date,coalesce(sum(c.net),0) revenue,count(DISTINCT c.order_key) FILTER(WHERE c.completed) orders
    FROM generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d
    LEFT JOIN current_rows c ON (c.closed_at AT TIME ZONE 'Europe/Prague')::date=d::date GROUP BY d
  ), food_drink AS (
    SELECT c.id,c.net,coalesce(sum((item->>'price')::numeric*(item->>'quantity')::numeric),0) lines,
      coalesce(sum((item->>'price')::numeric*(item->>'quantity')::numeric) FILTER(WHERE
        coalesce(item->>'itemType',item->>'item_type','')='food' OR
        (coalesce(item->>'itemType',item->>'item_type','')<>'drink' AND item->>'station'='kitchen')),0) food,
      coalesce(sum((item->>'price')::numeric*(item->>'quantity')::numeric) FILTER(WHERE
        coalesce(item->>'itemType',item->>'item_type','')='drink' OR
        (coalesce(item->>'itemType',item->>'item_type','')<>'food' AND item->>'station'='bar')),0) drinks
    FROM current_rows c LEFT JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(c.items)='array' THEN c.items ELSE '[]'::jsonb END) item ON true
    GROUP BY c.id,c.net
  ), breakdown AS (
    SELECT coalesce(sum(CASE WHEN lines>0 THEN least(round(net*food/lines,2),greatest(0,net-round(net*drinks/lines,2))) ELSE 0 END),0) food,
      coalesce(sum(CASE WHEN lines>0 THEN round(net*drinks/lines,2) ELSE 0 END),0) drinks,
      coalesce(sum(CASE WHEN lines>0 THEN greatest(0,net-round(net*food/lines,2)-round(net*drinks/lines,2)) ELSE net END),0) unclassified FROM food_drink
  ), referrals AS (
    SELECT referral_code_id,coalesce(code,'[unrecorded]') code,coalesce(partner,'[unrecorded]') partner,
      count(DISTINCT order_key) FILTER(WHERE completed) orders,count(*) payments,sum(net) net_sales,
      sum(referral_discount) discounts,CASE WHEN can_commission THEN sum(commission) ELSE NULL END commission
    FROM current_rows WHERE referral_code_id IS NOT NULL OR code IS NOT NULL GROUP BY referral_code_id,code,partner
  )
  SELECT jsonb_build_object(
    'canViewCommission',can_commission,
    'periods',(SELECT jsonb_agg(jsonb_build_object('from',f,'to',t,'payments',payments,'orders',orders,'gross',gross,'revenue',revenue,
      'average',CASE WHEN orders>0 THEN round(completed_value/orders,2) ELSE 0 END,'averagePerPerson',average_per_person,'discounts',discounts,'tips',tips,
      'referralRevenue',referral_revenue,'referralDiscounts',referral_discounts,'hourly',
      (SELECT jsonb_agg(jsonb_build_object('hour',h.hour,'revenue',h.revenue,'orders',h.orders) ORDER BY h.hour) FROM hourly h WHERE h.n=p.n)) ORDER BY n) FROM period_totals p),
    'daily',coalesce((SELECT jsonb_agg(jsonb_build_object('date',sales_date,'revenue',revenue,'orders',orders) ORDER BY sales_date) FROM daily),'[]'::jsonb),
    'breakdown',(SELECT to_jsonb(b) FROM breakdown b),
    'referrals',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY net_sales DESC,code,partner) FROM referrals r),'[]'::jsonb),
    'attributions',coalesce((SELECT jsonb_object_agg(id::text,jsonb_build_object('codeId',referral_code_id,'code',code,'partner',partner,
      'discountPercent',referral_percent,'discountAmount',referral_discount,'commission',commission)) FROM metadata_rows WHERE referral_code_id IS NOT NULL OR code IS NOT NULL),'{}'::jsonb),
    'codes',coalesce((SELECT jsonb_agg(code ORDER BY code) FROM (SELECT DISTINCT coalesce(code,'[unrecorded]') code FROM attributed a,windows w WHERE w.n=0 AND a.closed_at>=w.starts AND a.closed_at<w.ends AND (a.referral_code_id IS NOT NULL OR a.code IS NOT NULL)) x),'[]'::jsonb),
    'partners',coalesce((SELECT jsonb_agg(partner ORDER BY partner) FROM (SELECT DISTINCT coalesce(partner,'[unrecorded]') partner FROM attributed a,windows w WHERE w.n=0 AND a.closed_at>=w.starts AND a.closed_at<w.ends AND (a.referral_code_id IS NOT NULL OR a.code IS NOT NULL)) x),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$history$;
REVOKE ALL ON FUNCTION public.history_sales_analytics(date,date,uuid,uuid,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.history_sales_analytics(date,date,uuid,uuid,text,text,text,boolean) TO service_role;

-- One persisted number per Send, shared by kitchen and bar, reset by Prague day.
CREATE TABLE IF NOT EXISTS public.station_order_numbers (
  table_id uuid NOT NULL,
  ordered_at timestamptz NOT NULL,
  ticket_day date NOT NULL,
  ticket_number bigint NOT NULL CHECK(ticket_number>0),
  PRIMARY KEY(table_id,ordered_at),
  UNIQUE(ticket_day,ticket_number)
);
ALTER TABLE public.station_order_numbers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.station_order_numbers FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.station_order_numbers TO service_role;
LOCK TABLE public.order_items IN SHARE ROW EXCLUSIVE MODE;

DO $backfill$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.station_order_numbers) THEN
    WITH snapshots AS (
      SELECT oi.table_id,oi.created_at ordered_at,oi.modifiers FROM public.order_items oi WHERE NOT coalesce(oi.hide_on_kds,false)
      UNION ALL
      SELECT s.table_id,(j->>'createdAt')::timestamptz,j->'modifiers'
      FROM public.sales s CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.items)='array' THEN s.items ELSE '[]'::jsonb END) j
      WHERE s.table_id IS NOT NULL AND j->>'createdAt' ~ '^\d{4}-\d{2}-\d{2}T' AND NOT coalesce((j->>'hideOnKds')::boolean,false)
    ), waves AS (
      SELECT DISTINCT coalesce(nullif(modifiers#>>'{itemTransfer,fromTableId}','')::uuid,table_id) table_id,ordered_at,
        (ordered_at AT TIME ZONE 'Europe/Prague')::date ticket_day FROM snapshots WHERE ordered_at IS NOT NULL
    )
    INSERT INTO public.station_order_numbers(table_id,ordered_at,ticket_day,ticket_number)
    SELECT table_id,ordered_at,ticket_day,row_number() OVER(PARTITION BY ticket_day ORDER BY ordered_at,table_id) FROM waves;
  END IF;
END;
$backfill$;

CREATE OR REPLACE FUNCTION public.stamp_station_order_number() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $ticket$
DECLARE assigned_number bigint; assigned_day date; original_table uuid;
BEGIN
  IF TG_OP='UPDATE' AND OLD.modifiers->>'kitchenOrderNumber' ~ '^[1-9][0-9]*$' THEN
    NEW.modifiers:=coalesce(NEW.modifiers,'{}'::jsonb)||jsonb_build_object('kitchenOrderNumber',OLD.modifiers->'kitchenOrderNumber',
      'kitchenOrderDay',coalesce(OLD.modifiers->>'kitchenOrderDay',(OLD.created_at AT TIME ZONE 'Europe/Prague')::date::text));
    RETURN NEW;
  END IF;
  -- Transfer fragments inherit their original order; they never reserve a new number.
  IF auth.role()='service_role' AND NEW.modifiers ? 'itemTransfer' AND EXISTS(
    SELECT 1 FROM public.station_order_numbers n WHERE n.ticket_day::text=NEW.modifiers->>'kitchenOrderDay'
      AND n.ticket_number::text=NEW.modifiers->>'kitchenOrderNumber'
  ) THEN RETURN NEW; END IF;
  IF coalesce(NEW.hide_on_kds,false) THEN RETURN NEW; END IF;
  NEW.created_at:=coalesce(NEW.created_at,now());
  assigned_day:=(NEW.created_at AT TIME ZONE 'Europe/Prague')::date;
  original_table:=coalesce(nullif(NEW.modifiers#>>'{itemTransfer,fromTableId}','')::uuid,NEW.table_id);
  SELECT ticket_number INTO assigned_number FROM public.station_order_numbers WHERE table_id=original_table AND ordered_at=NEW.created_at;
  IF assigned_number IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('station-ticket:'||assigned_day::text,0));
    SELECT ticket_number INTO assigned_number FROM public.station_order_numbers WHERE table_id=original_table AND ordered_at=NEW.created_at;
    IF assigned_number IS NULL THEN
      SELECT coalesce(max(ticket_number),0)+1 INTO assigned_number FROM public.station_order_numbers WHERE ticket_day=assigned_day;
      INSERT INTO public.station_order_numbers VALUES(original_table,NEW.created_at,assigned_day,assigned_number);
    END IF;
  END IF;
  NEW.modifiers:=coalesce(NEW.modifiers,'{}'::jsonb)||jsonb_build_object('kitchenOrderNumber',assigned_number,'kitchenOrderDay',assigned_day);
  RETURN NEW;
END;
$ticket$;
REVOKE ALL ON FUNCTION public.stamp_station_order_number() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS stamp_station_order_number ON public.order_items;
CREATE TRIGGER stamp_station_order_number BEFORE INSERT OR UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.stamp_station_order_number();
UPDATE public.order_items SET modifiers=coalesce(modifiers,'{}'::jsonb)
WHERE NOT coalesce(hide_on_kds,false) AND NOT(coalesce(modifiers,'{}'::jsonb) ? 'kitchenOrderNumber');
NOTIFY pgrst,'reload schema';
COMMIT;
