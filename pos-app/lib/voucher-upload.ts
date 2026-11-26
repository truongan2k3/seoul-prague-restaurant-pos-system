"use client";

async function normalizeImageForVoucher(
  file: File,
  role: "front-bg" | "back-bg" | "logo",
): Promise<File> {
  if (typeof document === "undefined") return file;
  const maxDim = role === "logo" ? 600 : 1600;
  const preferPng = role === "logo" || file.type === "image/png";
  const needsConvert = file.type === "image/webp" || file.size > 1.8 * 1024 * 1024 || !file.type.startsWith("image/");
  if (!needsConvert && (file.type === "image/png" || file.type === "image/jpeg")) {
    // Still resize oversized dimensions if needed
  }

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const shouldRedraw =
          scale < 1 || (file.type !== "image/png" && file.type !== "image/jpeg");
        if (!shouldRedraw) {
          URL.revokeObjectURL(objectUrl);
          resolve(file);
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const outType = preferPng ? "image/png" : "image/jpeg";
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) {
              resolve(file);
              return;
            }
            const ext = preferPng ? "png" : "jpg";
            const base = file.name.replace(/\.[^.]+$/, "") || role;
            resolve(new File([blob], `${base}.${ext}`, { type: outType }));
          },
          outType,
          preferPng ? undefined : 0.9,
        );
      } catch {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
}

export async function uploadVoucherDesignAsset(
  file: File,
  role: "front-bg" | "back-bg" | "logo",
): Promise<{ publicUrl?: string; error?: string }> {
  const preparedFile = await normalizeImageForVoucher(file, role);

  const prepRes = await fetch("/api/vouchers/staff/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, fileName: preparedFile.name }),
  });
  const prep = (await prepRes.json().catch(() => ({}))) as {
    signedUrl?: string;
    publicUrl?: string;
    error?: string;
  };
  if (!prepRes.ok || !prep.signedUrl || !prep.publicUrl) {
    return { error: prep.error || `Upload prep failed (HTTP ${prepRes.status})` };
  }

  const form = new FormData();
  form.append("cacheControl", "31536000");
  form.append("", preparedFile);

  const putRes = await fetch(prep.signedUrl, {
    method: "PUT",
    headers: { "x-upsert": "true" },
    body: form,
  });
  if (!putRes.ok) {
    const detail = await putRes.text().catch(() => "");
    return { error: detail || `Upload failed (HTTP ${putRes.status})` };
  }

  return { publicUrl: prep.publicUrl };
}
