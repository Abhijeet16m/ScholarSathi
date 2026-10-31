// Gets a saved document ready for ONE upload box:
// right format, right pixel size, under the KB limit.

import { shrinkPdf } from "./pdfshrink.js";

export function kb(bytes) {
  return bytes > 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + " MB" : Math.round(bytes / 1024) + " KB";
}

function acceptOk(mime, accept) {
  if (!accept) return true;
  const a = accept.toLowerCase();
  if (mime === "application/pdf") return /pdf/.test(a);
  if (mime.startsWith("image/")) {
    if (/image\/\*/.test(a)) return true;
    if (mime === "image/jpeg") return /jpe?g/.test(a);
    if (mime === "image/png") return /png/.test(a);
    return a.includes(mime);
  }
  return false;
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// Draws the picture into a w x h box ("cover": fills the box, crops the extra edges)
async function drawCover(bitmap, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  const scale = Math.max(w / bitmap.width, h / bitmap.height);
  const dw = bitmap.width * scale;
  const dh = bitmap.height * scale;
  ctx.drawImage(bitmap, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return canvas;
}

async function fitImage(blob, rule) {
  const bitmap = await createImageBitmap(blob);
  const fixedSize = rule.width && rule.height;

  // PNG-only boxes: just resize, no quality tricks
  if (rule.png) {
    const canvas = await drawCover(bitmap, rule.width || bitmap.width, rule.height || bitmap.height);
    return await toBlob(canvas, "image/png");
  }

  // If the portal gave a pixel size we must use it. Otherwise we may
  // shrink the picture step by step until the file fits.
  const sizeSteps = fixedSize ? [1] : [1, 0.75, 0.5, 0.35, 0.25];
  for (const step of sizeSteps) {
    const w = fixedSize ? rule.width : Math.max(1, Math.round(bitmap.width * step));
    const h = fixedSize ? rule.height : Math.max(1, Math.round(bitmap.height * step));
    const canvas = await drawCover(bitmap, w, h);

    if (!rule.maxKB) return await toBlob(canvas, "image/jpeg", 0.92);

    let low = 0.05, high = 0.95, best = null;
    for (let i = 0; i < 8; i++) {
      const q = (low + high) / 2;
      const out = await toBlob(canvas, "image/jpeg", q);
      if (out.size / 1024 <= rule.maxKB) { best = out; low = q; } else { high = q; }
    }
    if (best) return best;
  }
  return null;
}

// Returns { blob, name } or { error }
export async function prepareFile(doc, rule, accept, baseName) {
  const isPdf = doc.mime === "application/pdf" || /\.pdf$/i.test(doc.name);
  const isImg = doc.mime.startsWith("image/");

  if (rule.format === "pdf" && !isPdf) return { error: "needs a PDF, but your saved file is an image" };
  if (rule.format === "image" && !isImg) return { error: "needs an image, but your saved file is a PDF" };

  if (isPdf) {
    if (rule.maxKB && doc.blob.size / 1024 > rule.maxKB) {
      const r = await shrinkPdf(doc.blob, rule.maxKB);
      if (r.error) return { error: r.error };
      return { blob: r.blob, name: baseName + ".pdf" };
    }
    return { blob: doc.blob, name: doc.name };
  }

  if (isImg) {
    const noLimits = !rule.maxKB && !rule.width && !rule.height;
    if (noLimits && acceptOk(doc.mime, accept)) return { blob: doc.blob, name: doc.name };
    const out = await fitImage(doc.blob, rule);
    if (!out) return { error: "could not shrink below " + rule.maxKB + " KB" };
    return { blob: out, name: baseName + (rule.png ? ".png" : ".jpg") };
  }
  return { error: "unsupported file type" };
}
