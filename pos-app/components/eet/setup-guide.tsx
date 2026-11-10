"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { EetEncryptionKeyGenerator } from "./encryption-key-generator";

export type EetSetupScript = { id: string; title: string; path: string; code: string };
const envTemplate = `# Vercel server Environment Variables — keep existing working values.
SUPABASE_SERVICE_ROLE_KEY=<existing Supabase service-role key>
AUTH_SECRET=<existing strong auth secret, at least 32 characters>
EET_BUSINESS_ID=<business UUID from Supabase>
EET_ADMIN_STAFF_IDS=<authorized admin staff UUIDs, comma separated>
EET_SETTINGS_ENCRYPTION_KEY=<32 random bytes encoded as base64>

# Leave these off while importing files and preparing the database.
EET_CHECKOUT_ENABLED=false
EET_WORKER_ENABLED=false
EET_PROTOCOL_REVIEWED=false
EET_COMPLIANCE_REVIEW_APPROVED=false
EET_PRODUCTION_APPROVED=false

# Configure these separately when deploying the durable worker after acceptance.
# EET_WORKER_SECRET=<a different strong random secret, at least 32 characters>
# EET_WORKER_URL=https://<your-pos-host>/api/eet/worker`;
const idsSql = `-- IDs only; no passwords or customer/payment data.
SELECT b.id AS business_id, s.id AS admin_staff_id, b.name AS business_name
FROM public.businesses b JOIN public.staff s ON s.business_id=b.id
WHERE s.active=true AND s.role IN ('admin','cashier','manager')
ORDER BY b.id,s.id;`;

function CopyBlock({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  return <details className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
    <summary className="cursor-pointer text-sm font-semibold">{title}</summary>
    <button type="button" className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs dark:border-gray-700" disabled={!text} onClick={async () => {
      try { await navigator.clipboard.writeText(text); setCopied(true); setError(""); }
      catch { setError("Clipboard unavailable. Select and copy the text below."); }
    }}>{copied ? <Check size={14}/> : <Copy size={14}/>}{copied ? "Copied" : "Copy"}</button>
    {error && <p role="status" className="mt-2 text-xs text-amber-600">{error}</p>}
    <pre tabIndex={0} className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-gray-50 p-3 text-xs dark:bg-gray-950">{text || "Script unavailable in this deployment. Use the matching file in the EET pull request."}</pre>
  </details>;
}
export function EetSetupGuide({ scripts, initialOpen = false, encryptionConfigured = false, hasStoredMaterials = false }: {
  scripts: EetSetupScript[];
  initialOpen?: boolean;
  encryptionConfigured?: boolean;
  hasStoredMaterials?: boolean;
}) {
  return <details open={initialOpen || undefined} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
    <summary className="cursor-pointer font-semibold">One-time setup · tasks you can do yourself</summary>
    <p className="mt-3 text-sm text-gray-500">Use your current Supabase and Vercel projects. Start with the read-only check and confirm a recoverable backup. Installation scripts run once; if an EET object already exists, compare the schema before running that migration. Nothing on this page executes SQL against your database.</p>
    <ol className="my-4 list-decimal space-y-2 pl-5 text-sm">
      <li>Supabase → SQL Editor: run the read-only check, review missing columns, policies and existing triggers, then apply each missing migration in order.</li>
      <li>Vercel → Settings → Environment Variables: complete the server values below, then redeploy. Keep the existing AUTH_SECRET; replacing it signs staff out.</li>
      <li>Return here and import tax-office files using the forms. Supabase keys, database passwords and the master encryption key belong in server settings, never the certificate forms.</li>
    </ol>
    <div className="space-y-3">
      {scripts.map(script => <CopyBlock key={script.id} title={`${script.title} · ${script.path}`} text={script.code}/>)}
      <CopyBlock title="Find business/admin IDs — paste in Supabase SQL Editor" text={idsSql}/>
      <CopyBlock title="Server environment template — use Vercel, not POS certificate inputs" text={envTemplate}/>
      <EetEncryptionKeyGenerator alreadyConfigured={encryptionConfigured} hasStoredMaterials={hasStoredMaterials}/>
    </div>
    <p className="mt-3 text-xs text-gray-500">Keep a secure backup of the encryption key. Rotating or losing it without re-encrypting stored material prevents decryption. Uploads and database setup do not approve legal reporting or activate Production.</p>
    <a href="https://eet.gov.cz/cs/pro-vyvojare/dokumenty-ke-stazeni" target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm text-emerald-700 underline dark:text-emerald-400">Official EET files and instructions<ExternalLink size={14}/></a>
  </details>;
}
