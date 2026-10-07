'use client';
import type React from 'react';
import { useMemo, useRef, useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { callOcr, type OcrModel } from '@/lib/ocr/client';
import { pagesToDraftRows, toOcrPage, type OcrPage } from '@/lib/ocr/extract';
import { expandPdfPages } from '@/lib/pdf-split';
import { draftFromOcrRow, draftsFromCsv, type DraftPayload } from '@/lib/draft-import';

type Mode = 'perPage' | 'aggregate';

/** Pause between files so a large batch does not hit the per-minute OCR limit at once. */
const THROTTLE_MS = 600;
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

function filesFromDataTransfer(dt: DataTransfer): File[] {
  const out: File[] = [];
  for (const it of Array.from(dt.items ?? [])) {
    if (it.kind === 'file') {
      const f = it.getAsFile();
      if (f) out.push(f);
    }
  }
  if (!out.length) out.push(...Array.from(dt.files ?? []));
  return out;
}

type BulkProps = {
  /** Saves the drafts with one request; resolves to false when saving failed (already reported). */
  onAppendDrafts: (rows: DraftPayload[]) => Promise<boolean>;
};

export default function BulkRegisterPage({ onAppendDrafts }: BulkProps) {
  const [model, setModel] = useState<OcrModel>('prebuilt-receipt');
  const [mode, setMode] = useState<Mode>('perPage');
  const [files, setFiles] = useState<File[]>([]);
  const previews = useMemo(
    () =>
      files.map((f, idx) => ({
        key: `${f.name}-${f.size}-${f.lastModified}-${idx}`,
        url: f.type?.startsWith('image/') ? URL.createObjectURL(f) : '',
        name: f.name,
        size: f.size,
        type: f.type || '',
      })),
    [files],
  );

  useEffect(() => {
    return () => {
      try {
        for (const p of previews) if (p.url) URL.revokeObjectURL(p.url);
      } catch {}
    };
  }, [previews]);

  const [busy, setBusy] = useState<'idle' | 'parsing' | 'posting'>('idle');
  const statusText = { idle: '', parsing: '解析中…', posting: '登録中…' }[busy];

  const inputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const addFiles = async (list: File[]) => {
    if (!list.length) return;
    const expanded = await expandPdfPages(list);
    setFiles((prev) => [...prev, ...expanded]);
  };

  const onPick = (ev: React.ChangeEvent<HTMLInputElement>) => addFiles(Array.from(ev.target.files ?? []));

  const onDrop = (ev: React.DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    ev.stopPropagation();
    void addFiles(filesFromDataTransfer(ev.dataTransfer));
  };
  const onDragOver = (ev: React.DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    ev.stopPropagation();
  };

  const onPickCsv = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (csvInputRef.current) csvInputRef.current.value = '';
    if (!file) return;
    const drafts = draftsFromCsv(await file.text());
    if (!drafts.length) {
      alert('CSVに取り込めるデータがありません。');
      return;
    }
    setBusy('posting');
    try {
      await onAppendDrafts(drafts);
    } finally {
      setBusy('idle');
    }
  };

  const removeFile = (idx: number) => {
    try {
      const p = previews[idx];
      if (p?.url) URL.revokeObjectURL(p.url);
    } catch {}
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const parseAllWithThrottle = async () => {
    if (!files.length) return alert('ファイルを選択してください');
    setBusy('parsing');
    try {
      const pages: OcrPage[] = [];
      const failures: string[] = [];
      for (const f of files) {
        await sleep(THROTTLE_MS);
        try {
          // 429/503 + Retry-After のときだけ 1 回再試行（それ以外のエラーは再試行しない）
          pages.push(toOcrPage(f.name, { raw: await callOcr(f, model, { retries: 1 }) }));
        } catch (e) {
          const message = e instanceof Error ? e.message : '解析に失敗しました';
          pages.push(toOcrPage(f.name, { error: message }));
          failures.push(`${f.name}: ${message}`);
        }
      }

      const drafts = pagesToDraftRows(pages, mode).map(draftFromOcrRow);
      if (failures.length) {
        alert(`${failures.length}件のファイルを解析できませんでした。\n${failures.join('\n')}`);
      }
      if (!drafts.length) return;

      setBusy('posting');
      if (await onAppendDrafts(drafts)) {
        setFiles([]);
        if (inputRef.current) inputRef.current.value = '';
      }
    } finally {
      setBusy('idle');
    }
  };

  return (
    <Card>
      <CardContent className="p-6" onDrop={onDrop} onDragOver={onDragOver} onDragEnter={onDragOver}>
        {/* drops here bubble up to CardContent's handlers */}
        <div className="border-2 border-dashed border-(--border) rounded-xl p-8 text-center text-sm text-(--muted)">
          ここにファイルをドラッグ&ドロップ（複数可）／PDFも可（複数ページPDFは自動でページ分割）
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <input ref={inputRef} type="file" multiple onChange={onPick} />

            <div className="flex items-center gap-2">
              <span aria-hidden="true">形式</span>
              <select
                aria-label="形式"
                className="border rounded-sm px-2 py-1 bg-(--card)"
                value={model}
                onChange={(e) => setModel(e.target.value as OcrModel)}
              >
                <option value="prebuilt-receipt">レシート</option>
                <option value="invoice">請求書</option>
                <option value="auto">auto</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span aria-hidden="true">モード</span>
              <select
                aria-label="モード"
                className="border rounded-sm px-2 py-1 bg-(--card)"
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
              >
                <option value="perPage">ページごとに分割（ページ=1行）</option>
                <option value="aggregate">1ファイルに集計（1行）</option>
              </select>
            </div>

            <Button
              size="md"
              onClick={parseAllWithThrottle}
              disabled={!files.length || busy !== 'idle'}
              className="bg-green-700 hover:bg-green-800 text-white"
            >
              解析
            </Button>
            <span className="text-(--muted)">状態: {statusText}</span>
          </div>
        </div>

        {files.length > 0 && (
          <div className="mt-3">
            <div className="text-xs text-(--muted) mb-2">追加済みファイル（{files.length}）</div>
            <div className="flex flex-wrap gap-3">
              {previews.map((p, idx) => (
                <div
                  key={p.key}
                  className="relative border rounded-lg p-2 pr-8 flex items-center gap-2 bg-(--card) shadow-xs"
                >
                  {p.url ? (
                    // biome-ignore lint/performance/noImgElement: local blob: preview of a picked file; next/image cannot optimise it
                    <img src={p.url} alt="" className="w-10 h-10 object-cover rounded-sm" />
                  ) : (
                    <div className="w-10 h-10 rounded-sm bg-(--muted-bg) grid place-items-center text-lg">📄</div>
                  )}
                  <div className="text-xs">
                    <div className="font-medium truncate max-w-[200px]" title={p.name}>
                      {p.name}
                    </div>
                    <div className="text-(--muted)">{Math.max(1, Math.round(p.size / 1024))}KB</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    aria-label={`${p.name} を削除`}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gray-300 hover:bg-gray-400 text-xs leading-5 text-white shadow-sm"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 flex justify-end">
          <Button
            size="md"
            onClick={() => csvInputRef.current?.click()}
            disabled={busy !== 'idle'}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            CSVインポート
          </Button>
          <input ref={csvInputRef} type="file" accept=".csv" onChange={onPickCsv} hidden />
        </div>
      </CardContent>
    </Card>
  );
}
