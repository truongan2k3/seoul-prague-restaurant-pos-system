BEGIN;

ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS item_transfer_version bigint NOT NULL DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS item_transfer_closes_bill boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS public.item_transfers (
  id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES public.businesses(id),
  source_table_id uuid NOT NULL, destination_table_id uuid NOT NULL,
  source_label text NOT NULL, destination_label text NOT NULL,
  source_visit timestamptz, destination_visit timestamptz,
  actor_id uuid NOT NULL, actor_name text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('wrong_table','customer_moved','split_group','other')),
  note text NOT NULL DEFAULT '', event_kind text NOT NULL CHECK (event_kind IN ('TRANSFER_ORDER_ITEM','UNDO_ITEM_TRANSFER')),
  reversal_of uuid REFERENCES public.item_transfers(id), items jsonb NOT NULL, request_payload jsonb NOT NULL,
  amount numeric(12,2) NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX IF NOT EXISTS item_transfers_one_reversal ON public.item_transfers(reversal_of) WHERE reversal_of IS NOT NULL;
CREATE INDEX IF NOT EXISTS item_transfers_source ON public.item_transfers(business_id,source_table_id,created_at DESC);
CREATE INDEX IF NOT EXISTS item_transfers_destination ON public.item_transfers(business_id,destination_table_id,created_at DESC);
ALTER TABLE public.item_transfers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.item_transfers FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.item_transfers TO service_role;

-- Kitchen progress may advance while the transfer dialog is open. All other data must still match.
CREATE OR REPLACE FUNCTION public.item_transfer_signature(p_row jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
  SELECT p_row - ARRAY['status','kitchen_status','ready_at','updated_at'];
$$;

-- Durable print suppression: an edit cannot turn a moved row into a new kitchen ticket.
CREATE OR REPLACE FUNCTION public.item_transfer_print_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.modifiers ? 'itemTransfer' THEN
    NEW.modifiers := coalesce(NEW.modifiers,'{}') || jsonb_build_object('itemTransfer',
      CASE WHEN auth.role()='service_role' AND NEW.modifiers ? 'itemTransfer'
        THEN NEW.modifiers->'itemTransfer' ELSE OLD.modifiers->'itemTransfer' END);
  END IF;
  IF TG_OP='UPDATE' AND OLD.modifiers ? 'itemTransferRevision' AND auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.modifiers:=coalesce(NEW.modifiers,'{}') || jsonb_build_object('itemTransferRevision',OLD.modifiers->'itemTransferRevision');
  END IF;
  IF NEW.modifiers ? 'itemTransfer' THEN NEW.skip_print:=true; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS item_transfer_print_guard ON public.order_items;
CREATE TRIGGER item_transfer_print_guard BEFORE INSERT OR UPDATE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.item_transfer_print_guard();

-- The counter is scoped to an actual seating; explicit checkout/release starts a fresh visit.
CREATE OR REPLACE FUNCTION public.item_transfer_visit_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.status='empty' THEN NEW.item_transfer_version:=0; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS item_transfer_visit_guard ON public.tables;
CREATE TRIGGER item_transfer_visit_guard BEFORE UPDATE ON public.tables
FOR EACH ROW EXECUTE FUNCTION public.item_transfer_visit_guard();

-- Serializes checkout with transfers, including an old checkout dialog on another device.
-- Existing equal/item splits keep their normal allocation rules; only moved visits need this guard.
CREATE OR REPLACE FUNCTION public.item_transfer_payment_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE version bigint; entry jsonb; allocation record; expected_price numeric; current_item public.order_items; allocations jsonb:='[]';
BEGIN
  SELECT item_transfer_version INTO version FROM public.tables WHERE id=NEW.table_id FOR UPDATE;
  IF coalesce(version,0)=0 THEN RETURN NEW; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(NEW.items) LOOP
    IF jsonb_typeof(entry->'unitIds')='array' AND jsonb_array_length(entry->'unitIds')>1 THEN
      allocations:=allocations || (SELECT jsonb_agg(jsonb_build_object('id',value,'quantity',1,'price',entry->'price'))
        FROM jsonb_array_elements_text(entry->'unitIds'));
    ELSE
      allocations:=allocations || jsonb_build_array(jsonb_build_object('id',entry->'id','quantity',entry->'quantity','price',entry->'price'));
    END IF;
  END LOOP;
  FOR allocation IN SELECT id,sum(quantity) quantity,min(price) min_price,max(price) max_price
    FROM jsonb_to_recordset(allocations) AS x(id uuid,quantity numeric,price numeric) GROUP BY id LOOP
    SELECT * INTO current_item FROM public.order_items WHERE id=allocation.id AND table_id=NEW.table_id FOR UPDATE;
    expected_price:=CASE WHEN NEW.split_mode='equal' AND NEW.split_count>1 THEN round(current_item.price/NEW.split_count,2) ELSE current_item.price END;
    IF NOT FOUND OR allocation.quantity IS NULL OR allocation.quantity<=0 OR allocation.quantity>current_item.quantity OR current_item.is_cancelled
      OR current_item.kitchen_status IN ('archived','cancelled')
      OR allocation.min_price IS DISTINCT FROM expected_price OR allocation.max_price IS DISTINCT FROM expected_price THEN
      RAISE EXCEPTION 'Items changed after a table transfer. Reopen checkout before taking payment.';
    END IF;
  END LOOP;
  IF (NEW.item_transfer_closes_bill OR coalesce(NEW.split_mode,'total')<>'items') AND EXISTS (
    SELECT 1 FROM public.order_items oi WHERE oi.table_id=NEW.table_id AND NOT coalesce(oi.is_cancelled,false)
      AND coalesce(oi.kitchen_status,'pending') NOT IN ('archived','cancelled')
      AND NOT coalesce(oi.is_printed_note,false) AND NOT coalesce((oi.modifiers->>'kitchenMessage')::boolean,false)
      AND oi.quantity>coalesce((SELECT sum(x.quantity) FROM jsonb_to_recordset(allocations) AS x(id uuid,quantity numeric) WHERE x.id=oi.id),0)
  ) THEN RAISE EXCEPTION 'The bill received transferred items. Reopen checkout before closing this table.'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS item_transfer_payment_guard ON public.sales;
CREATE TRIGGER item_transfer_payment_guard BEFORE INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION public.item_transfer_payment_guard();

CREATE OR REPLACE FUNCTION public.transfer_order_items(
  p_request uuid, p_source uuid, p_destination uuid, p_items jsonb,
  p_actor uuid, p_business uuid, p_reason text DEFAULT 'wrong_table', p_note text DEFAULT '', p_undo uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.staff; src public.tables; dst public.tables; existing public.item_transfers;
  original public.item_transfers; item public.order_items;
  selection jsonb; saved jsonb; moved jsonb; line jsonb; details jsonb:='[]';
  selected_quantity integer; moved_id uuid; total numeric:=0; now_at timestamptz:=clock_timestamp();
  event_name text:=CASE WHEN p_undo IS NULL THEN 'TRANSFER_ORDER_ITEM' ELSE 'UNDO_ITEM_TRANSFER' END;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required'; END IF;
  SELECT * INTO actor FROM public.staff WHERE id=p_actor AND business_id=p_business AND active
    AND role IN ('admin','manager','cashier','server');
  IF NOT FOUND THEN RAISE EXCEPTION 'Staff authorization required'; END IF;
  IF p_request IS NULL OR p_source IS NULL OR p_destination IS NULL OR p_source=p_destination THEN RAISE EXCEPTION 'Choose two different tables'; END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('wrong_table','customer_moved','split_group','other') OR length(coalesce(p_note,''))>1000 THEN RAISE EXCEPTION 'Invalid transfer reason'; END IF;
  IF p_undo IS NULL AND (p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'Select items to transfer'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  SELECT * INTO existing FROM public.item_transfers WHERE id=p_request;
  IF FOUND THEN
    IF existing.business_id<>p_business OR existing.source_table_id<>p_source OR existing.destination_table_id<>p_destination
      OR existing.reversal_of IS DISTINCT FROM p_undo OR existing.reason<>p_reason OR existing.note<>coalesce(p_note,'') OR existing.request_payload IS DISTINCT FROM coalesce(p_items,'[]'::jsonb) THEN RAISE EXCEPTION 'Transfer request key conflict'; END IF;
    RETURN jsonb_build_object('id',existing.id,'amount',existing.amount,'replayed',true);
  END IF;
  -- Deterministic table locks also protect occupied-at visits and concurrent sales inserts.
  PERFORM id FROM public.tables WHERE id IN (p_source,p_destination) ORDER BY id FOR UPDATE;
  SELECT * INTO src FROM public.tables WHERE id=p_source;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source table no longer exists'; END IF;
  SELECT * INTO dst FROM public.tables WHERE id=p_destination;
  IF NOT FOUND THEN RAISE EXCEPTION 'Destination table no longer exists'; END IF;
  IF src.payment_status='paid' OR (dst.payment_status='paid' AND dst.status<>'empty') THEN RAISE EXCEPTION 'Paid tables cannot receive or transfer items'; END IF;
  IF (src.occupied_at IS NULL AND EXISTS(SELECT 1 FROM public.sales WHERE table_id=p_source))
    OR (dst.status<>'empty' AND dst.occupied_at IS NULL AND EXISTS(SELECT 1 FROM public.sales WHERE table_id=p_destination)) THEN
    RAISE EXCEPTION 'Missing table seating time. Staff must resolve the visit before moving items safely.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sales s WHERE s.table_id IN (p_source,p_destination) AND (
    (s.table_id=p_source AND src.occupied_at IS NOT NULL AND (s.seated_at=src.occupied_at OR s.closed_at>=src.occupied_at)) OR
    (s.table_id=p_destination AND dst.status<>'empty' AND dst.occupied_at IS NOT NULL AND (s.seated_at=dst.occupied_at OR s.closed_at>=dst.occupied_at)) OR
    EXISTS (SELECT 1 FROM jsonb_array_elements(s.items) si JOIN public.order_items oi ON oi.table_id=s.table_id
      AND (si->>'id'=oi.id::text OR coalesce(si->'unitIds','[]') ? oi.id::text))
  )) THEN RAISE EXCEPTION 'This visit has payment/refund history. Automatic item transfer or undo is not safe.'; END IF;
  PERFORM id FROM public.order_items WHERE table_id IN (p_source,p_destination) ORDER BY id FOR UPDATE;
  IF p_undo IS NOT NULL THEN
    SELECT * INTO original FROM public.item_transfers WHERE id=p_undo AND business_id=p_business FOR UPDATE;
    IF NOT FOUND OR original.event_kind<>'TRANSFER_ORDER_ITEM' OR original.source_table_id<>p_destination OR original.destination_table_id<>p_source THEN RAISE EXCEPTION 'Transfer cannot be reversed for these tables'; END IF;
    IF EXISTS(SELECT 1 FROM public.item_transfers WHERE reversal_of=p_undo) THEN RAISE EXCEPTION 'Transfer already undone'; END IF;
    IF src.occupied_at IS DISTINCT FROM original.destination_visit OR dst.occupied_at IS DISTINCT FROM original.source_visit THEN RAISE EXCEPTION 'The table visit changed. Automatic undo is no longer safe.'; END IF;
    FOR line IN SELECT value FROM jsonb_array_elements(original.items) LOOP
      SELECT * INTO item FROM public.order_items WHERE id=(line->>'movedId')::uuid AND table_id=p_source;
      IF NOT FOUND OR public.item_transfer_signature(to_jsonb(item)) IS DISTINCT FROM line->'after' THEN RAISE EXCEPTION 'A transferred item was paid, removed, moved again or edited. Automatic undo is no longer safe.'; END IF;
      IF item.is_cancelled OR item.kitchen_status IN ('archived','cancelled') THEN RAISE EXCEPTION 'Finalized items cannot be undone'; END IF;
      saved:=to_jsonb(item);
      -- Return the fragment independently: never merge different preparation states.
      UPDATE public.order_items SET table_id=p_destination,skip_print=true,updated_at=now_at,
        modifiers=coalesce(modifiers,'{}') || jsonb_build_object('itemTransfer',jsonb_build_object(
          'event',event_name,'transferId',p_request,'rootItemId',coalesce(modifiers->'itemTransfer'->>'rootItemId',id::text),
          'fromLabel',src.label,'fromTableId',src.id,'reversalOf',p_undo)) WHERE id=item.id RETURNING to_jsonb(order_items.*) INTO moved;
      details:=details || jsonb_build_array(jsonb_build_object('before',saved,'movedId',item.id,'quantity',item.quantity,'after',public.item_transfer_signature(moved)));
    END LOOP;
    total:=original.amount;
  ELSE
    IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_items))<>jsonb_array_length(p_items) THEN RAISE EXCEPTION 'Duplicate selected item'; END IF;
    FOR selection IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->>'id' LOOP
      selected_quantity:=(selection->>'quantity')::integer;
      SELECT * INTO item FROM public.order_items WHERE id=(selection->>'id')::uuid AND table_id=p_source;
      IF NOT FOUND THEN RAISE EXCEPTION 'An item moved or was removed. Refresh the selection.'; END IF;
      IF public.item_transfer_signature(to_jsonb(item)) IS DISTINCT FROM public.item_transfer_signature(selection->'expected') THEN RAISE EXCEPTION 'An item changed. Refresh the selection before transferring.'; END IF;
      IF selected_quantity IS NULL OR selected_quantity<=0 OR selected_quantity>item.quantity OR item.is_cancelled OR item.kitchen_status IN ('archived','cancelled') OR item.is_printed_note OR coalesce((item.modifiers->>'kitchenMessage')::boolean,false) THEN RAISE EXCEPTION 'Only available unpaid food/drink quantities can be transferred'; END IF;
      saved:=to_jsonb(item); moved_id:=CASE WHEN selected_quantity=item.quantity THEN item.id ELSE gen_random_uuid() END;
      moved:=saved || jsonb_build_object('id',moved_id,'table_id',p_destination,'quantity',selected_quantity,'skip_print',true,'updated_at',now_at,
        'modifiers',coalesce(item.modifiers,'{}') || jsonb_build_object('itemTransfer',jsonb_build_object(
          'event',event_name,'transferId',p_request,'rootItemId',coalesce(item.modifiers->'itemTransfer'->>'rootItemId',item.id::text),
          'fromLabel',src.label,'fromTableId',src.id,'parentItemId',item.id)));
      IF selected_quantity=item.quantity THEN
        UPDATE public.order_items SET table_id=p_destination,skip_print=true,updated_at=now_at,modifiers=moved->'modifiers' WHERE id=item.id;
      ELSE
        UPDATE public.order_items SET quantity=item.quantity-selected_quantity,updated_at=now_at,
          modifiers=coalesce(modifiers,'{}') || jsonb_build_object('itemTransferRevision',p_request) WHERE id=item.id;
        INSERT INTO public.order_items SELECT (jsonb_populate_record(NULL::public.order_items,moved)).*;
      END IF;
      SELECT to_jsonb(oi.*) INTO moved FROM public.order_items oi WHERE id=moved_id;
      total:=total+item.price*selected_quantity;
      details:=details || jsonb_build_array(jsonb_build_object('before',saved,'movedId',moved_id,'quantity',selected_quantity,'after',public.item_transfer_signature(moved)));
    END LOOP;
  END IF;
  -- Rebuild only the bill cache. Never release source occupancy or touch reservation/voucher ownership.
  UPDATE public.tables t SET orders=coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',oi.id,'name',oi.name,'price',oi.price,'quantity',oi.quantity,'tableId',oi.table_id,
    'menuItemId',oi.menu_item_id,'notes',oi.notes,'notesTranslated',oi.notes_translated,
    'station',oi.station,'status',oi.status,'kitchenStatus',oi.kitchen_status,'readyAt',oi.ready_at,
    'createdAt',oi.created_at,'selectedAddons',oi.selected_addons,'modifiers',oi.modifiers,
    'skipPrint',oi.skip_print,'hideOnKds',oi.hide_on_kds,'isPrintedNote',oi.is_printed_note,
    'taxGroup',to_jsonb(oi)->'tax_group','itemType',to_jsonb(oi)->'item_type'
  ) ORDER BY oi.created_at,oi.id) FROM public.order_items oi WHERE oi.table_id=t.id
    AND NOT coalesce(oi.is_cancelled,false) AND coalesce(oi.kitchen_status,'pending') NOT IN ('archived','cancelled')),'[]'::jsonb),
    item_transfer_version=item_transfer_version+1,
    status=CASE
      WHEN EXISTS(SELECT 1 FROM public.order_items oi WHERE oi.table_id=t.id AND NOT coalesce(oi.is_cancelled,false)
        AND coalesce(oi.kitchen_status,'pending') NOT IN ('archived','cancelled')) THEN
        CASE WHEN EXISTS(SELECT 1 FROM public.order_items oi WHERE oi.table_id=t.id
          AND NOT coalesce(oi.is_cancelled,false) AND NOT coalesce(oi.hide_on_kds,false)
          AND coalesce(oi.kitchen_status,'pending') NOT IN ('archived','cancelled')
          AND (coalesce(oi.kitchen_status,'pending') IN ('pending','preparing') OR oi.status IN ('pending','preparing','held','fired','delayed')))
        THEN 'waiting' ELSE 'ready' END
      WHEN t.id=p_destination AND t.status='empty' THEN 'waiting' ELSE t.status END,
    payment_status=CASE WHEN t.id=p_destination AND t.status='empty' THEN 'unpaid' ELSE t.payment_status END,
    fulfillment_status=CASE WHEN t.id=p_destination AND t.status='empty' THEN 'in_progress' ELSE t.fulfillment_status END,
    occupied_at=CASE WHEN t.id=p_destination AND t.status='empty' THEN coalesce(t.occupied_at,now_at) ELSE t.occupied_at END
  WHERE t.id IN (p_source,p_destination);
  SELECT occupied_at INTO dst.occupied_at FROM public.tables WHERE id=p_destination;
  INSERT INTO public.item_transfers(id,business_id,source_table_id,destination_table_id,source_label,destination_label,
    source_visit,destination_visit,actor_id,actor_name,reason,note,event_kind,reversal_of,items,request_payload,amount,created_at)
    VALUES (p_request,p_business,p_source,p_destination,src.label,dst.label,
    src.occupied_at,dst.occupied_at,actor.id,actor.name,p_reason,coalesce(p_note,''),event_name,p_undo,details,coalesce(p_items,'[]'::jsonb),total,now_at);
  INSERT INTO public.table_activity_logs(table_id,table_label,action,staff_id,staff_name,meta)
    SELECT t.id,t.label,event_name,actor.id,actor.name,jsonb_build_object('transferId',p_request,'from',src.label,'to',dst.label,
      'amount',total,'reason',p_reason,'note',coalesce(p_note,''),'reversalOf',p_undo,
      'items',(SELECT jsonb_agg(jsonb_build_object('name',value->'before'->>'name','quantity',value->'quantity','itemId',value->>'movedId')) FROM jsonb_array_elements(details)))
    FROM public.tables t WHERE t.id IN (p_source,p_destination);
  RETURN jsonb_build_object('id',p_request,'amount',total);
END $$;
REVOKE ALL ON FUNCTION public.transfer_order_items(uuid,uuid,uuid,jsonb,uuid,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_order_items(uuid,uuid,uuid,jsonb,uuid,uuid,text,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.item_transfer_payment_guard() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.item_transfer_print_guard() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
