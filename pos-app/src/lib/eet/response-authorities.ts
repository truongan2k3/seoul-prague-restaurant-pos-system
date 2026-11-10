// EET Playground/Production operational information §3.3 points to I.CA.
// DER SHA-256 fingerprints are published at https://www.ica.cz/korenove-certifikaty.
export const EET_RESPONSE_AUTHORITIES = [
  { name: "I.CA Root CA/RSA 05/2022", serial: "100000002", sha256: "d279c01a12e8dd9a6230e459faa447ceb336998477338c2ee4135c96737418eb", url: "https://www.ica.cz/sites/default/files/download/2025/rca22_rsa.pem" },
  { name: "I.CA Public CA/RSA 06/2022", serial: "100001063", sha256: "df5baf6d7e1a7d14e9911c5b8c676ec6ebcad9354a74f4ac7314e133e07a94de", url: "https://www.ica.cz/sites/default/files/download/2025/pca22_rsa.pem" },
] as const;
