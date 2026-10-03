// PDF SHRINKER
// Idea: draw every page of the PDF as a picture, save each picture as a
// compressed JPEG, then build a brand-new PDF out of those JPEGs.
// Result: a much smaller PDF. Trade-off: text is no longer selectable
// (it becomes part of the picture). That is fine for upload portals.
//
// Two helper libraries do the heavy lifting (they live in the lib/ folder):
//   - pdf.js  : reads the old PDF and draws its pages
//   - pdf-lib : builds the new PDF  (loaded in the page as PDFLib)

import * as pdfjsLib from "./lib/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./lib/pdf.worker.min.mjs", import.meta.url).href;

// Each attempt = [how big to draw the pages, JPEG quality].
// We start gentle and get stronger until the file is small enough.
const ATTEMPTS = [
  [1.5, 0.70],
  [1.25, 0.60],
  [1.0, 0.50],
  [1.0, 0.35],
  [0.8, 0.35],
  [0.7, 0.30],
  [0.6, 0.25],
  [0.5, 0.20]
];

const MAX_PAGES = 10;

function canvasToJpegBytes(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => resolve(new Uint8Array(await blob.arrayBuffer())), "image/jpeg", quality);
  });
}

// Draw every page at a given scale. Returns a list of canvases.
async function renderPages(pdf, scale) {
  const canvases = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    // remember the page's real size (in PDF points) so the new PDF keeps it
    const base = page.getViewport({ scale: 1 });
    canvases.push({ canvas, widthPt: base.width, heightPt: base.height });
  }
  return canvases;
}

// Build a new PDF from the pages at a given JPEG quality.
async function buildPdf(rendered, quality) {
  const out = await PDFLib.PDFDocument.create();
  for (const r of rendered) {
    const jpgBytes = await canvasToJpegBytes(r.canvas, quality);
    const img = await out.embedJpg(jpgBytes);
    const page = out.addPage([r.widthPt, r.heightPt]);
    page.drawImage(img, { x: 0, y: 0, width: r.widthPt, height: r.heightPt });
  }
  return await out.save();
}

// Main function: returns { blob, pages } or { error: "..." }
export async function shrinkPdf(inputBlob, maxKB) {
  const data = new Uint8Array(await inputBlob.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data, verbosity: 0 }).promise;

  if (pdf.numPages > MAX_PAGES) {
    return { error: "PDF has " + pdf.numPages + " pages (limit for shrinking is " + MAX_PAGES + ")" };
  }

  let lastScale = null;
  let rendered = null;

  for (const [scale, quality] of ATTEMPTS) {
    if (scale !== lastScale) {          // only redraw pages when the size changes
      rendered = await renderPages(pdf, scale);
      lastScale = scale;
    }
    const bytes = await buildPdf(rendered, quality);
    if (bytes.length / 1024 <= maxKB) {
      return { blob: new Blob([bytes], { type: "application/pdf" }), pages: pdf.numPages };
    }
  }
  return { error: "could not shrink below " + maxKB + " KB" };
}
