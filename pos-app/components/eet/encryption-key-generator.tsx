"use client";

import { useId, useState } from "react";
import { Check, Copy, Eye, EyeOff, KeyRound } from "lucide-react";

export function EetEncryptionKeyGenerator({ alreadyConfigured = false, hasStoredMaterials = false }: {
  alreadyConfigured?: boolean;
  hasStoredMaterials?: boolean;
}) {
  const inputId = useId();
  const [key, setKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700";

  return <section className="min-w-0 rounded-xl border border-gray-200 p-4 dark:border-gray-800" aria-label="Encryption key setup">
    <h3 className="text-sm font-semibold">Generate the encryption key · no installation needed</h3>
    {alreadyConfigured || hasStoredMaterials ? <p className="mt-2 text-sm text-gray-500">
      {alreadyConfigured ? "An encryption key is already configured on this deployment. Keep that existing value." : "Encrypted EET files already exist. Restore the original encryption key from your secure backup."}
      {" "}Generating a replacement would prevent access to existing encrypted files.
    </p> : <>
      <p className="mt-2 text-sm text-gray-500">For first-time setup only. Your browser creates the key locally using secure randomness. This page does not send or save it to the server.</p>
      {!key ? <button type="button" className={`${buttonClass} mt-3`} onClick={() => {
        try {
          if (!window.isSecureContext || !window.crypto?.getRandomValues) throw new Error("Secure browser required");
          const bytes = window.crypto.getRandomValues(new Uint8Array(32));
          setKey(btoa(String.fromCharCode(...bytes)));
          bytes.fill(0);
          setCopied(false);
          setVisible(false);
          setMessage("");
        } catch {
          setMessage("Open POS using HTTPS in an up-to-date browser to generate a key.");
        }
      }}><KeyRound size={16} aria-hidden="true"/>Generate key on this device</button> : <div className="mt-3 space-y-3">
        <label htmlFor={inputId} className="block break-all text-xs font-medium">EET_SETTINGS_ENCRYPTION_KEY</label>
        <input id={inputId} type={visible ? "text" : "password"} value={key} readOnly autoComplete="off" spellCheck={false}
          className="block w-full min-w-0 rounded-lg border border-gray-300 bg-gray-50 p-3 font-mono text-sm dark:border-gray-700 dark:bg-gray-950" onFocus={event => event.currentTarget.select()}/>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass} onClick={async () => {
            try { await navigator.clipboard.writeText(key); setCopied(true); setMessage("Copied. Paste the value into Vercel Environment Variables."); }
            catch { setMessage("Clipboard unavailable. Choose Show, then select and copy the key manually."); }
          }}>{copied ? <Check size={16} aria-hidden="true"/> : <Copy size={16} aria-hidden="true"/>}{copied ? "Copied" : "Copy key"}</button>
          <button type="button" className={buttonClass} aria-pressed={visible} onClick={() => setVisible(value => !value)}>
            {visible ? <EyeOff size={16} aria-hidden="true"/> : <Eye size={16} aria-hidden="true"/>}{visible ? "Hide" : "Show"}
          </button>
          <button type="button" className={buttonClass} onClick={() => { setKey(""); setVisible(false); setCopied(false); setMessage("Key cleared from this page."); }}>Clear</button>
        </div>
        <p className="text-sm text-gray-500">Vercel → Settings → Environment Variables: add EET_SETTINGS_ENCRYPTION_KEY and paste this key as its Value, then save and redeploy. Back it up securely. Use the same key for deployments sharing the database; do not replace an existing key. Clearing or leaving this page discards this copy.</p>
      </div>}
      <p role="status" className="mt-2 text-sm text-gray-500">{message}</p>
    </>}
  </section>;
}
