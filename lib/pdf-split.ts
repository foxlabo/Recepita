// lib/pdf-split.ts
// Browser-side: split a multi-page PDF into one File per page
// ("name_p1.pdf", "name_p2.pdf", …) so each page can be analysed separately.
// pdf-lib is loaded on demand. On any error the original file is returned.

export async function splitPdfToFiles(file: File): Promise<File[]> {
  try {
    const { PDFDocument } = await import('pdf-lib');
    const buf = await file.arrayBuffer();
    const srcPdf = await PDFDocument.load(buf);
    const pages = srcPdf.getPageCount();
    if (pages <= 1) return [file];
    const out: File[] = [];
    for (let i = 0; i < pages; i++) {
      const newPdf = await PDFDocument.create();
      const [copied] = await newPdf.copyPages(srcPdf, [i]);
      newPdf.addPage(copied);
      const bytes: Uint8Array = await newPdf.save();
      const ab = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(ab).set(bytes);
      const base = (file.name ?? 'page').replace(/\.pdf$/i, '');
      const filename = `${base}_p${i + 1}.pdf`;
      out.push(new File([ab], filename, { type: 'application/pdf' }));
    }
    return out;
  } catch {
    return [file];
  }
}

/** PDFs are expanded to one file per page; other files are kept as they are. */
export async function expandPdfPages(list: File[]): Promise<File[]> {
  const expanded: File[] = [];
  for (const f of list) {
    if (f.type === 'application/pdf') expanded.push(...(await splitPdfToFiles(f)));
    else expanded.push(f);
  }
  return expanded;
}
