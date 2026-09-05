"use client";

/**
 * Upload large files straight to Supabase Storage (signed URL PUT).
 * Avoids HTTP 413 from Next/Vercel request body limits.
 */
export async function uploadFileDirectToStorage(
  file: File,
  folder: string,
): Promise<{ publicUrl?: string; storagePath?: string; error?: string }> {
  const prepResponse = await fetch("/api/website/signed-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      folder,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
    }),
  });
  const prep = (await prepResponse.json().catch(() => ({}))) as {
    signedUrl?: string;
    token?: string;
    path?: string;
    publicUrl?: string;
    error?: string;
  };
  if (!prepResponse.ok || !prep.signedUrl || !prep.path || !prep.publicUrl) {
    return { error: prep.error || `Could not prepare upload (HTTP ${prepResponse.status})` };
  }

  // Match supabase-js uploadToSignedUrl: Blob/File goes as multipart FormData.
  const form = new FormData();
  form.append("cacheControl", "31536000");
  form.append("", file);

  const putResponse = await fetch(prep.signedUrl, {
    method: "PUT",
    headers: {
      "x-upsert": "true",
    },
    body: form,
  });

  if (!putResponse.ok) {
    const detail = await putResponse.text().catch(() => "");
    return {
      error:
        detail ||
        `Direct storage upload failed (HTTP ${putResponse.status}). Check Supabase storage policies.`,
    };
  }

  return { publicUrl: prep.publicUrl, storagePath: prep.path };
}
