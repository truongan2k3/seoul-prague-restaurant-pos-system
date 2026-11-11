# EET 2.0 integration — implementation and release record

Status: implementation prepared on an isolated branch. Nothing applied to live Supabase,
no Production deployment, and no reporting mode activated. The operator requested code and
migrations only. This is **not a certificate of legal compliance or a completed Playground acceptance**.

Operator update: using the existing live Supabase database is authorized; a separate staging
project is optional. First run `supabase/eet-preflight-readonly.sql`, inspect existing triggers
and confirm a recoverable backup. Keep all activation flags false and EET Disabled/Paused
while preparing the additive schema. Do not create test payments, edit historical payments
or send real restaurant transactions to Playground. The authorization to use live data does
not activate Production reporting or establish the unresolved compliance gates below.
Current workspace access is limited to the public/anon client configuration; SQL administration
and backup access have not been granted, so no live database inspection/migration is claimed.

Operator self-service update: **POS → Settings → EET Integration** (`/app/eet`) includes file/paste forms for official
WSDL/XSD, PKCS#12 `.p12/.pfx` plus password (or separate PEM key/certificate), and tax-authority
response signing leaf certificates. It also displays copyable read-only preflight/install SQL,
business/admin-ID queries and Vercel bootstrap instructions even before EET setup is ready.
This does not execute SQL or edit Vercel settings automatically.

EET settings and dashboard now live inside POS Settings. Legacy Admin URLs redirect to
`/app/eet`; the website Admin navigation no longer includes EET. Every EET settings,
material, dashboard/export and manual worker action requires both an active allowlisted
admin/cashier/manager account and a server-verified POS manager code. Payments do not
require an EET manager unlock. The authorization is an HttpOnly, SameSite=Strict signed
cookie (Secure in production), bound to business, staff session and the current manager
code, expiring after 10 minutes. Staff-session changes, code rotation and explicit lock
invalidate it. No default manager code is used by EET. Existing POS settings/code storage
and permissions should be included in the deployment security review.

After the first two migrations, apply `202611100003_eet_manager_access.sql` from step 4
in the POS setup guide. This additive rerunnable migration creates a service-role-only
rate-limit RPC (five attempts per staff and thirty per business within fifteen minutes,
serialized under a transaction advisory lock) and extends encrypted imports to explicitly
authorized managers. It does not change payments, modes, pending jobs or encrypted data.
Manager unlocks/attempts are audited without code values. Set `EET_ADMIN_STAFF_IDS` to the
authorized staff UUIDs and keep your existing manager code in POS Settings → Security.

For acknowledgment trust, the import accepts either existing independently verified leaf
pins or the exact two I.CA CA certificates published by the official EET §3.3 source:
`I.CA Root CA/RSA 05/2022` (serial 100000002) and `I.CA Public CA/RSA 06/2022`
(serial 100001063). POS displays their official download links and DER SHA-256 fingerprints.
CA imports must match both published fingerprints; arbitrary roots and mixed chains are
rejected. The acknowledgment's referenced WS-Security signer is validated through that
chain (RSA strength, validity, basic constraints/path length, key usage, issuer signatures),
then checked against current issuer-signed CRLs before the existing XML body signature,
attempt UUID and environment checks. CRL retrieval is restricted to `.ica.cz` CRL URLs,
allows at most two manually validated redirects (no HTTPS downgrade), has a six-second
download deadline within a twelve-second per-certificate mirror budget and a 4 MB size
limit, verifies issuer/signature/freshness and fails closed on
revocation or unavailable evidence. No AIA certificate fetching or trust-on-first-use occurs.
Unsupported critical/indirect/delta CRLs remain blocked for review. Verified CRLs are cached
for at most fifteen minutes and never beyond nextUpdate; each signer serial is rechecked.
Legacy explicit leaf pins retain their existing separate provisioning/review requirements.
The CA path still needs a real signed Playground round trip and deployment network review;
synthetic chain/CRL tests are not official acceptance.

The POS probe reports bounded `EET_TEST_REVOCATION_*` diagnostics, distinguishing network,
timeout, HTTP, redirect, size, format, signature, issuer, stale, revoked and unsupported
CRL failures. Only a public validated certificate CRL endpoint and certificate role are
included; raw fetch/parser/crypto exception messages are never returned. A verified
revocation is terminal and cannot be overridden by a later mirror. These diagnostics
do not bypass revocation validation or establish that deployment networking is healthy.

In **EET Dashboard → View**, managers can inspect the saved immutable fiscal Data fields,
verified acknowledgment, and attempt/audit metadata. The readable view distinguishes a
queued/attempted request from confirmed acceptance. Expanded JSON includes request/response
hashes and attempt UUIDs; it is not an archived complete signed SOAP envelope. Payment method
and internal sale references remain POS metadata; customer names, phone numbers and itemized
dishes are not fields of the current fiscal Data payload.

Playground connection verification requires only the official WSDL/XSD, a valid matching
Playground register certificate/private key, and saved unit/register IDs. Keep reporting
Disabled and submissions Paused, then use **Test Playground connection**. The action sends
a signed zero-value request with `overeni="true"` and uses the imported test certificate's
EIČ. Official interface v1.2 §2.2.1 Table 1 and §3.5 specify an unsigned `Chyba kod="0"`
response for a successful verification, so this Playground-only credential path does not
load or require acknowledgment signing pins. HTTPS certificate validation remains enabled.
Operational acknowledgments still require separately trusted signing certificates, and
Production approval gates remain unchanged. This check neither queues nor reports payments
and does not establish operational or Production acceptance.

After importing response trust, **Test signed Playground response** performs a separate,
zero-value operational probe fixed to the Playground endpoint and one of its reserved test
EIČ values. It requires step 3, verifies the signed test POK using the configured trust path,
and audits the bounded result. It creates no POS sale/outbox row, changes no reporting mode
or capture identity, and cannot approve Production. This explicit test is available before
setting EET_PROTOCOL_REVIEWED so the operator can obtain acceptance evidence before reviewing
and enabling normal reporting. The ordinary worker still requires protocol approval and
the configured operational credentials. A real successful signed test remains required;
the workspace network restriction prevents running it here.

**Prepare now / Apply later:** Save preparation accepts incomplete business/register
details and desired mode/submission selections without requiring checkout, worker, protocol
approval or an available tax endpoint. It writes a manager-authorized `preparation_saved`
event to the existing append-only EET audit table, scoped by business and active settings
version. It does not change `eet_settings`, freeze fiscal identity, create payments/outbox
jobs, start the worker or send messages. No new migration is needed. Only the eight
allowlisted public configuration fields are accepted; certificates/passwords/private keys
remain exclusively in the existing encrypted material import. The newest valid preparation
is restored across devices; a later Apply/settings version supersedes older preparation.

**Apply** saves the preparation first, then uses the existing authorized settings action,
SQL version/frozen-identity/queue guards, certificate checks and server acceptance gates.
Activating Production or suspending live reporting requires an explicit confirmation.
Saving a Production preparation is allowed while Production activation remains locked.
Known service/approval blockers do not prevent saving preparation and are summarized simply
at Apply; technical details remain in collapsed advanced sections. Successful applies return
the authoritative active settings/version and clear the superseded preparation from the
workspace snapshot. A failed readback is distinguished from an uncommitted save. Neither
preparation nor code deployment enables server flags or Production reporting.

Playground checks can use the saved preparation's unit/register fields while active
reporting stays unchanged. The reserved Playground signer identity is still selected
separately; the explicit signed probe remains fixed to Playground. The ordinary connection
check follows the active environment (Disabled defaults to Playground). The certificate
import defaults to Production for owner preparation, with protocol/response-trust forms
collapsed and the separate Playground selection retained.

Official availability was checked on **11 November 2026**: the Financial Administration
announced Playground open since **1 July 2026**, DIS+ registration/unit creation/register
certificates available in November, and regular operation scheduled for **1 January 2027**.
These published dates establish service rollout, not live endpoint uptime or successful POS
integration. No real signed round trip or Production acceptance is claimed by this change.
Sources:
- https://eet.gov.cz/cs/pro-vyvojare/aktuality-pro-vyvojare/2026/financni-sprava-zpristupnila-testovaci-prostredi-p-1228
- https://eet.gov.cz/cs/o-eet/jaky-je-harmonogram-eet-2-0
- https://financnisprava.gov.cz/cs/financni-sprava/media-a-verejnost/tiskove-zpravy-gfr/tiskove-zpravy-2026/eet-2-0-podnikatele-se-jiz-mohou-prihlasit

For first-time encryption setup, use **Generate key on this device** in the setup guide.
No Node.js installation is needed: Web Crypto generates 32 random bytes in the browser,
encoded as base64. Copy the value into Vercel's `EET_SETTINGS_ENCRYPTION_KEY`, back it up
securely, then redeploy. The helper keeps the value only in component memory, masked by
default; it does not send it to the server or persist it in browser storage. It requires
HTTPS (or localhost). Deployments sharing encrypted material must use the same key.
Generation is unavailable when this deployment already has a valid key or known stored
material; restore the original key rather than generating a replacement in that case.

The additional migration `202611100002_eet_setup_materials.sql` stores authenticated-encrypted
material in a separate RLS-protected server-only table. A server-only
`EET_SETTINGS_ENCRYPTION_KEY` holds 32 random bytes encoded as base64. AES-256-GCM uses a new
nonce per write and binds the ciphertext to business, environment and material kind. Imports
are version-checked and audited atomically; audit/React responses expose only explicit metadata.
Passwords unlock imports once and are not retained. Browser fields clear after every attempt;
no certificate/key is returned for read-back, download or browser storage. The user-supplied
upload/paste necessarily passes through the authenticated browser over HTTPS. It is never
prepopulated from storage. Do not enter Supabase/service-role/database/master keys in those forms.

## Repository/database audit

- Next.js 16.2.12, React 19, TypeScript, Supabase JS, Vercel. Read the installed Next.js
  route-handler and Server Action documentation before adding these entry points.
- Checkout is `components/checkout-panel.tsx` → `hooks/use-table-order-workflow.tsx` →
  `src/lib/table-actions.ts:checkoutTable`. A `sales` row represents one confirmed cash/card
  payment component. The standalone terminal has no gateway callback; the staff confirmation
  is the only payment event currently available. Equal splits already store per-person amounts.
- Existing settlement preserves cooking KDS/bar tickets. The EET path reuses that exact code
  through `settleConfirmedCheckout`; it does not implement another kitchen/payment workflow.
- Referral sales have separate server validation and DB commission/audit triggers. Those remain
  in place. Enabled EET history adjustments add fiscal corrections via the same sales trigger.
- Database audit was limited to repository SQL and code. No service-role/database credential
  was present, and the operator chose not to grant live access. Actual deployed schema, data,
  RLS, triggers and backups must be compared on a staging clone before migration.
- Existing business accounts, staff, sales and tables have legacy permissive access policies.
  New EET tables/functions are server-only, and administration also requires a deployment
  allowlist. That does **not** cure legacy public account/staff/table mutation risks. Review
  and harden those access paths separately before Production; do not weaken EET permissions
  to imitate existing policies. Legacy signed sessions also need expiry/revocation review.

## Official evidence reviewed on 2026-11-10

Source index: https://eet.gov.cz/cs/pro-vyvojare/dokumenty-ke-stazeni

- `EET_popis_rozhrani_v1.2a_EN.pdf`, dated 2026-10-02, published 2026-10-07:
  https://eet.gov.cz/assets/cs/cmsmedia/pro-vyvojare/EET_popis_rozhrani_v1.2a_EN.pdf
- Playground operational information v1.1:
  https://eet.gov.cz/assets/cs/cmsmedia/pro-vyvojare/EET_pristupove_provozni_informace_playgr-2.pdf
- Production operational information v1.1:
  https://eet.gov.cz/assets/cs/cmsmedia/pro-vyvojare/EET_pristupove_provozni_informace_produk-3.pdf
- Data-item methodology v1.0, 2026-10-05:
  https://eet.gov.cz/assets/cs/cmsmedia/pro-vyvojare/EET_popis_polozek_datove_zpravy.pdf

Verified distinctions from EET 1.0: interface namespace `/v4`; EIČ `eic_popl`, DIS+ unit
`id_jednotky`, POS `id_pokl`, sequence `porad_cis`, acknowledgment **POK**. There are no
invented FIK/BKP/PKP fields. Operational/verification mode is separate from the target
environment. Verification code 0 is not payment acceptance. Playground POKs end in `-ff`
and do not satisfy legal reporting.

§5 of the interface document specifies WS-Security with an X509 BinarySecurityToken, RSA-SHA256,
SHA256 and Exclusive C14N, signing only SOAP Body. HTTPS uses TLS >=1.2, HTTP/1.1 and normal
server validation; client authentication is in SOAP, not mTLS. Requests are limited to 12 kB.

Each retry has a NEW `uuid_zpravy` and send time, with `prvni_zaslani=false`. Immutable Data
including amount, payment time and fiscal identity remains unchanged. The authority detects
the same sale using canonical Data identity (§4); a lost response is reconciled by replay,
not by inventing a status-query API. POK binds to the attempt UUID. Signed acknowledgments
are verified against separately provisioned trusted signing certificates and parsed only from
the verified SOAP body. DTDs, entities, extra bodies and unsafe signature transforms are rejected.

Methodology: actual amounts after discounts; business-owned tips included, employee-owned tips
may be excluded (§5.5). Refund/adjustment amounts are negative with their own event timestamp
and sequence (§4). Internal correction links are retained locally and are not invented XML fields.
Vouchers have multiple legal categories (§1 items 13/14); existing POS voucher credit alone
does not prove which applies. Such payments are held for reviewed mapping, with the source sale
preserved. Blocked cases are visible and must be resolved, not silently skipped.

## Files and design

- `supabase/migrations/202611100001_eet_integration.sql`: additive schema, restricted grants/RLS,
  sales outbox trigger, payment idempotency/revision RPC, settings audit and worker lease RPCs.
- `src/lib/eet`: authorization, policy, protocol/signing, environment credentials, transport,
  durable worker, payment/history actions and administration. No private material in React.
- `/app/eet` → Settings: modes, submission control, business/unit/register details, tip policy,
  confirmation phrases, certificate expiry metadata and verification test.
- `/app/eet` → Dashboard: counts, amounts, history, filters/search, pagination, CSV, errors, attempts,
  acknowledgments, certificate/worker health and authorized retry/reconciliation.
- `hooks/use-eet-checkout.tsx`: small POS indicator, durable browser retry intent, revision/visit
  validation, recovery of a recorded payment without charging again. Checkout controls unchanged.

Fresh installations default to Disabled/Paused. With `EET_CHECKOUT_ENABLED=false`, payment
and history writes follow the original implementation and do not require EET tables or keys.
Once fiscal capture is enabled, every eligible new sale/adjustment gets an immutable outbox
record in the SAME PostgreSQL transaction as the sale. Signing, TLS/network faults and
authority errors occur outside that transaction and cannot reverse a completed payment.
An actual database/trigger failure still aborts the transaction; atomic durability cannot be
promised while also ignoring a failed database write. Staff must distinguish a recorded payment
from an unrecorded manual terminal charge and must never charge a card again to repair reporting.

Pausing/disabling never deletes pending records. Capture continues in the sticky environment
after enablement; a previously live deployment cannot move obligations into Playground.
Fiscal identity and tip ownership are frozen once capture starts to protect pending snapshots.
Policy changes and voucher mappings require a reviewed, audited migration, not silent reclassification.

## Setup and credentials

See `docs/eet-environment.example` for every server-only variable. Do not commit `.env` files,
PEM keys, PKCS#12 archives or passphrases. Never use `NEXT_PUBLIC_` for EET material.

1. Snapshot the existing database. Use a staging clone if available; the operator has also
   authorized working on the existing database with activation flags off. Run the read-only
   preflight and inspect actual schemas/triggers
   against the audit above, especially staff business ownership, referral columns, sale totals,
   soft deletion, and table occupancy. Existing patches are prerequisites; EET does not seed or
   rewrite restaurant records. The migration is versioned and intended to run once.
2. Deploy code to staging with all five activation/review flags false. Confirm legacy cash/card,
   equal/item splits, tips/discounts, vouchers, referral commissions, KDS, bar and customer display.
3. Apply the additive migration on staging. All fiscal tables have RLS and no anon/authenticated
   access. Only trusted server service-role calls can use fiscal RPCs. Test those exact grants.
4. Set a strong AUTH_SECRET, existing EET_BUSINESS_ID and EET_ADMIN_STAFF_IDS allowlist.
   This release supports one explicitly configured restaurant business per deployment. Never
   infer fiscal tenancy from a frontend business ID or the first settings row.
5. Download exact official artifacts using `node scripts/eet-download-protocol.mjs /tmp/eet-official`
   in an environment allowed to reach `eet.gov.cz`. Review current WSDL/XSD and release notes.
   Pin their decoded-byte SHA256 values, and install base64 bytes in server configuration.
   SOAPAction is extracted from the reviewed WSDL rather than guessed.
6. Apply the additional encrypted-material migration and configure the one-time server encryption
   key. Obtain current official Playground PKCS#12 material from the source index, unzip the bundle
   locally and upload the `.p12/.pfx` plus password directly in POS Settings. Separate PEM paste/file
   fields are also available; private key/certificate matching, EIČ and expiry are checked server-side.
   Import the independently verified tax-authority **response signing leaf certificates**, including planned rotation pins.
   Do not confuse taxpayer CA certs, HTTPS CAs and response signing certs. The worker checks
   key/certificate match, EIČ, RSA strength and validity and does not trust response-supplied keys.
7. Upload or paste WSDL/XSD in POS; checksums are calculated from the imported UTF-8 contents.
   File imports preserve UTF-8 content; pasted text may have browser-normalized line endings.
   Validation checks XML/namespace/shape, not cryptographic authenticity or full XSD conformance.
   Run offline tests and validate real signed messages against the downloaded official XSD.
   The bundled parser/signature tests use explicitly synthetic test material, not official acceptance.
   A saved Disabled configuration can test Playground without enabling checkout/capture: save
   the unit/register IDs, import Playground credentials and click Test Playground connection.
   This sends only a zero-value `overeni=true` verification packet using the imported test EIČ.
   This specific verification can run before EET_PROTOCOL_REVIEWED; normal worker submissions
   still require that review flag, and Production remains separately locked. Code 0 verifies
   connectivity only; it does not approve compliance or report a sale.
8. Set EET_CHECKOUT_ENABLED and exercise staging payments/recovery. Enable a durable scheduler
   and EET_WORKER_ENABLED before saving Automatic submission. Alerts/counters remain visible
   during outages. Run the complete official Playground matrix below.
9. Replace certificates in the environment-specific POS import form. The new certificate/key
   pair is validated, encrypted and saved with an optimistic version check; its fingerprint and
   expiry are shown without returning bytes. An imported signer must match an already active
   EIČ for that environment. Legacy environment-managed certificates still work when no POS
   record exists. A damaged/unreadable POS record never silently falls back to old environment keys.
   Imports leave mode/queue/approval flags unchanged. Production credentials can be prepared
   without activating Production. Preserve and back up the encryption key; key rotation requires
   an explicit re-encryption migration before replacing the key. Do not lose it during rollback.

## Worker and Vercel

`/api/eet/worker` is protected by a constant-time comparison of a strong Bearer EET_WORKER_SECRET.
One invocation leases one job, persists a unique attempt, signs and sends with a bounded 4-second
network deadline, then atomically records the result using a fencing token. Vercel maxDuration=30s.
Leases last 60s, preventing overlap; expired leases become uncertain. An exponential backoff with
jitter continues without a maximum-attempt discard. Bad configuration is held for review;
technical persistence errors retry, network/invalid-response results reconcile via immutable replay.
Accepted records cannot be retried or mutated. Corrections wait for parent acknowledgment.

The payment action schedules an immediate Vercel `after()` attempt after durable payment capture.
That is an acceleration, **not** the recovery mechanism or a guarantee of first-attempt timing.
Run `node scripts/eet-worker.mjs` on a supervised always-on worker with EET_WORKER_URL pointing
to the staging/production POS and the matching secret. It polls quickly when jobs exist and backs
off on outages; queue/leases remain in PostgreSQL. Multiple supervised instances are safe.
Alternatively use a reliable managed scheduler calling the protected endpoint frequently enough
for expected throughput, and prove restart/outage recovery. Do not rely solely on an in-memory
timer or an infrequent free-tier cron. No cron, service or environment variable was deployed here.

Monitor queue age, 48-hour deadlines, certificate warning at <=30 days, errors and worker heartbeat
(stale after 120s). Dashboard polls while visible. Configure independent operator alerts for this
health and scheduler downtime using the read-only `/api/eet/health` endpoint with the same strong
worker Bearer credential. It returns 503 with bounded operational reasons for failed/held/overdue
records, stale heartbeat and certificate warnings; it never submits payments. Dashboard visibility
alone is not unattended monitoring. Never
discard overdue records: the official methodology says the obligation persists after 48 hours.

A Docker deployment package is provided under `ops/eet-worker/` (Node 22, non-root,
read-only filesystem, restart policy, bounded logs and an endpoint-heartbeat health check).
On an always-on host with Docker Compose:

```sh
cp ops/eet-worker/environment.example ops/eet-worker/.env.eet-worker
# Edit this private file on the host; never paste its secret into chat or source control.
# Set the same EET_WORKER_SECRET in Vercel and use the deployed HTTPS /api/eet/worker URL.
docker compose -f ops/eet-worker/compose.yaml up -d --build
docker compose -f ops/eet-worker/compose.yaml ps
```

Keep EET_WORKER_ENABLED=false while preparing the runner. Enable it only as part of
reviewed Playground/Production rollout, with approved capture configuration. Prove a
container/host restart, scheduler outage and queue recovery before relying on the runner.
Configure an external monitor for container health and `/api/eet/health`; Docker health
status alone does not send staff alerts or automatically restart an unhealthy running process.
The worker container needs only EET_WORKER_URL/SECRET; private certificates and database
service keys remain on the POS server. Roll back the UI/server deployment without removing
the additive migration, queue, audit history or encryption key; keep/recover the supervised
worker for outstanding reporting obligations.

The current workspace has no live Vercel/Supabase server credentials and the operator chose
to add outbound domains later. No migration was applied to the real database and no worker
was started on a live host. Official CA download/CRL endpoints and actual signed Playground
acceptance remain operator/deployment prerequisites. The reported successful verification
test from the operator is a connection check, not a full operational acceptance test.

## Required acceptance and unresolved Production gates

Not completed in this workspace: official XSD/WSDL download (network policy blocked direct access),
official test certificates/signing pins, official Playground HTTP/signature round-trip, real Supabase
schema/RLS verification and real POS regression run. Browsing verified the official PDF documents;
it did not validate downloaded XSD/WSDL bytes. Submission is deliberately blocked until reviewed
artifacts and credentials are configured. No guessed SOAPAction or substitute EET 1.0 schema exists.

The legal methodology §6 requires the first submission attempt at payment/payment-order time,
with a response limit of at least two seconds, and later retry without undue delay (48h latest).
The current standalone terminal exposes only later staff confirmation; the repository does not
capture the terminal's earlier payment-order time. A post-commit `after()` worker does not prove
these timing conditions. Resolve the terminal event/timestamp and initial-send timing with the
operator/compliance reviewer before Production. Confirm negative-history edits represent actual
refund/correction events and capture exact refund time if processing them retrospectively.

Also required: voucher issue/redemption classification and any remote voucher sales reporting,
tip policy ownership, legacy auth/RLS hardening, response certificate trust/rotation/revocation
procedure, packet XSD validation, externally monitored worker reliability/throughput, complete
settlement recovery under simultaneous table moves/merges and actual schema triggers, and
current statutory interpretation for this restaurant. These remain explicit acceptance gates.

Only after passing these checks, with operator approval, may an authorized deployment set both
EET_COMPLIANCE_REVIEW_APPROVED=true and EET_PRODUCTION_APPROVED=true and install separate
production credentials. The Admin then must type ACTIVATE PRODUCTION. Leaving/pausing live
submissions requires STOP LIVE SUBMISSIONS. No approval flags are automatically generated.

Official Playground matrix to record: cash, staff-confirmed card, mixed-method equal/item splits,
business/employee tips, discounts/rounding, linked partial/full refunds, repeated requests,
concurrent devices, lost HTTP responses, invalid/expired certificates, wrong environments,
unsigned/wrapped/tampered responses, authority -1 errors, worker kill/restart, paused/disabled
queues, credential rotation, unauthorized roles, wrong business and CSV export permissions.

## Local validation commands

```
npm run test:eet
npx tsc --noEmit --incremental false
npm run lint
npm run build
```

The EET tests use temporary self-signed keys and a PostgreSQL engine in memory (PGlite), applying
the actual migration against a documented minimal legacy fixture. They do not claim coverage of
the actual deployed database/referral/KDS triggers or tax-authority acceptance. Full repository
lint has pre-existing violations; the new EET files are separately linted and baseline compared.

Validation record (2026-11-10, base main `9f8b04d`): 59 EET tests passed, including PKCS#12/PEM
imports, encryption/tamper/scope isolation, optimistic versions, RPC authorization and stored-material
worker reads. TypeScript no-emit
passed; focused lint for all new EET code/tests/scripts passed. Full lint and an isolated checkout
of base main both report 178 errors and 75 warnings. Production bundle build passed with EET
activation flags false and a non-live localhost Supabase URL, using existing public-page fallbacks.
No production database, real payment, private restaurant certificate or tax-authority submission
was used. Runtime account/KDS regression and official Playground acceptance remain outstanding.
An isolated Chromium preview exercised protocol paste, PKCS#12 upload, PEM replacement, response
pin import and the SQL copy button with a fake Supabase backend and generated fixture certificates.
Secret inputs cleared, responses contained no fixture key/certificate/password bytes, Production
remained disabled and the 768px tablet viewport had no horizontal overflow. Production build
tracing includes all three setup SQL files so the copyable scripts remain available on Vercel.

## Rollback

Before capture begins, keep feature flags false and settings Disabled; reverting application
code leaves additive schema intact and original records unchanged. Do not drop fiscal tables.
After capture begins, do not roll back to an old direct-anon checkout: the capture trigger requires
the secure path, and obligations continue. Keep secure checkout deployed, pause sending only
with administrator confirmation if operationally necessary, preserve/export all queue/attempt/audit
records and continue reconciliation. Restore the last known-good secure worker/configuration,
then resume. Database schema rollback needs a reviewed data-retention plan and must never
delete pending or accepted history as an application rollback shortcut.
