'use client';
import Button from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';

/** A draft as returned by GET /api/expense-drafts. */
export type DraftRow = {
  id: string;
  registeredDate: string; // 登録日（JST の YYYY-MM-DD）
  tradeDate: string; // 取引日（YYYY-MM-DD）
  amount: number;
  vendor: string;
  category: string;
  memo: string;
  itemsSummary: string;
};

type Props = {
  drafts: DraftRow[];
  busy?: boolean;
  onDelete: (id: string) => void;
  onClear: () => void;
  onFinalize: () => void;
};

/** 下書き一覧（個別登録・一括登録の両タブで共通） */
export default function DraftsCard({ drafts, busy = false, onDelete, onClear, onFinalize }: Props) {
  return (
    <Card>
      <CardHeader className="p-4 border-b border-(--border) flex items-center justify-between">
        <div>下書き</div>
        <div className="flex items-center gap-2">
          <Button size="md" variant="outline" onClick={onClear} disabled={busy || drafts.length === 0}>
            クリア
          </Button>
          <Button size="md" onClick={onFinalize} disabled={busy || drafts.length === 0}>
            {busy ? '登録中…' : '登録'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-(--border) rounded-lg overflow-hidden">
            <thead className="bg-(--muted-bg) border-b border-(--border)">
              <tr className="text-left">
                <th className="p-2">登録日</th>
                <th className="p-2">取引日</th>
                <th className="p-2 text-right">金額</th>
                <th className="p-2">取引先</th>
                <th className="p-2">区分</th>
                <th className="p-2">品目</th>
                <th className="p-2">メモ</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {drafts.map((x) => (
                <tr key={x.id} className="border-b border-(--border)">
                  <td className="p-2 whitespace-nowrap">{x.registeredDate}</td>
                  <td className="p-2 whitespace-nowrap">{x.tradeDate}</td>
                  <td className="p-2 text-right">{Number(x.amount).toLocaleString()}</td>
                  <td className="p-2">{x.vendor}</td>
                  <td className="p-2">{x.category || '-'}</td>
                  <td className="p-2 max-w-[360px] truncate" title={x.itemsSummary || ''}>
                    {x.itemsSummary || '-'}
                  </td>
                  <td className="p-2">{x.memo || ''}</td>
                  <td className="p-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
                      disabled={busy}
                      onClick={() => onDelete(x.id)}
                    >
                      削除
                    </Button>
                  </td>
                </tr>
              ))}
              {drafts.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-3 text-(--muted)">
                    下書きなし
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
