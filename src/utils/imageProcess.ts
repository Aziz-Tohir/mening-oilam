// Client-side image conversion: preserves visual quality, downscales only if
// needed, re-encodes to WebP (with JPEG fallback) for smaller uploads.

export type ProcessedImage = {
  blob: Blob;
  ext: string;
  contentType: string;
  width: number;
  height: number;
};

const MAX_DIM = 2048;
const QUALITY = 0.92;

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file); } catch { /* fallthrough */ }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Rasmni kodlab bo'lmadi")), type, quality);
  });
}

export async function processImageForUpload(file: File): Promise<ProcessedImage> {
  const bmp = await loadBitmap(file);
  const srcW = (bmp as any).width as number;
  const srcH = (bmp as any).height as number;
  if (!srcW || !srcH) throw new Error("Rasm o'lchamini o'qib bo'lmadi");

  const scale = Math.min(1, MAX_DIM / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas qo'llab-quvvatlanmaydi");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp as CanvasImageSource, 0, 0, w, h);
  if ("close" in bmp) (bmp as ImageBitmap).close();

  const isPng = file.type === "image/png";
  const targetType = isPng ? "image/png" : "image/webp";
  let blob = await canvasToBlob(canvas, targetType, QUALITY);
  let ext = isPng ? "png" : "webp";
  let contentType = targetType;
  // Some browsers silently fall back when WebP isn't supported
  if (targetType === "image/webp" && !blob.type.includes("webp")) {
    blob = await canvasToBlob(canvas, "image/jpeg", QUALITY);
    ext = "jpg";
    contentType = "image/jpeg";
  }

  return { blob, ext, contentType, width: w, height: h };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
