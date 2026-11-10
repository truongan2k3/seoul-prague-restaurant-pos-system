const messages = {
  NETWORK: "The server could not download the I.CA CRL. Check outbound access to the displayed endpoint.",
  TIMEOUT: "The I.CA CRL download exceeded its time limit. Retry and check server connectivity to the displayed endpoint.",
  HTTP: "The I.CA endpoint returned an unsuccessful HTTP response instead of a CRL.",
  REDIRECT: "The CRL endpoint redirected outside the approved I.CA CRL locations, downgraded HTTPS, or exceeded two redirects.",
  SIZE: "The CRL exceeded the supported 4 MB size limit. Review the published CRL before changing this limit.",
  FORMAT: "The downloaded file could not be parsed as a supported CRL. Review the official CRL format.",
  SIGNATURE: "The CRL signature or signing algorithm could not be verified against its issuer.",
  ISSUER: "The CRL issuer or algorithm does not match the certificate issuer.",
  STALE: "The CRL is expired or not yet valid. Check the server clock and the authority's current CRL.",
  REVOKED: "The response signing certificate is listed as revoked. Do not accept this response; obtain the current official signing certificate.",
  UNSUPPORTED: "The CRL contains unsupported critical, indirect or delta extensions. These require review before acceptance.",
} as const;
export type CrlFailure = keyof typeof messages;

/** Static explanations plus the public, validated certificate CRL URL only.
 * No fetch/crypto exception text is exposed to the POS or logs. */
export class EetCrlError extends Error {
  constructor(readonly reason: CrlFailure, readonly endpoint: string | null = null, readonly certificateRole: "issuer" | "response signer" | null = null) {
    super(messages[reason]);
  }
}

export function crlValidationFailure(error: unknown): CrlFailure {
  const message = error instanceof Error ? error.message : "";
  if (message === "Response certificate has been revoked.") return "REVOKED";
  if (message === "CRL is stale or not yet valid.") return "STALE";
  if (message === "CRL signature could not be verified." || message === "Invalid CRL algorithm.") return "SIGNATURE";
  if (message === "Invalid CRL issuer." || message === "CRL issuer/algorithm mismatch.") return "ISSUER";
  if (message === "Delta, indirect or critical CRL extensions are unsupported." || message === "Unsupported indirect or critical CRL entry extension.") return "UNSUPPORTED";
  if (message === "Invalid CRL size.") return "SIZE";
  return "FORMAT";
}
