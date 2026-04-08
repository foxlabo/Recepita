export type OcrResult = {
  ocrText: string;
  detected: {
    date?: string;
    amount?: number;
    vendor?: string;
    items?: Array<{ name?: string; qty?: number; price?: number; total?: number }>;
    tax?: number;
    subtotal?: number;
  };
};
export interface OcrProvider {
  parseReceiptFromBuffer(buffer: Buffer, mimeType?: string): Promise<OcrResult>;
}
