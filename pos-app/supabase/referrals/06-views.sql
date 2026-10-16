BEGIN;
CREATE OR REPLACE VIEW public.referral_balances AS
 SELECT c.id AS code_id,c.business_id,
 coalesce((SELECT sum(amount) FROM public.referral_commissions l WHERE l.code_id=c.id),0) AS earned,
 coalesce((SELECT sum(amount) FROM public.referral_payouts p WHERE p.code_id=c.id),0) AS paid,
 coalesce((SELECT sum(amount) FROM public.referral_commissions l WHERE l.code_id=c.id),0)-coalesce((SELECT sum(amount) FROM public.referral_payouts p WHERE p.code_id=c.id),0) AS outstanding
 FROM public.referral_codes c;
CREATE OR REPLACE VIEW public.referral_reservation_history AS
 SELECT r.id,r.referral_code_id,a.business_id,r.guest_name,r.party_size,r.actual_party_size,r.reserved_at,r.checked_in_at,r.status,r.table_id,r.booking_code,
 EXISTS(SELECT 1 FROM public.sales s WHERE s.reservation_id=r.id AND s.referral_code_id=a.code_id AND s.deleted_at IS NULL) AS has_paid
 FROM public.reservations r JOIN public.referral_attributions a ON a.reservation_id=r.id;
REVOKE ALL ON public.referral_balances,public.referral_reservation_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.referral_balances,public.referral_reservation_history TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
