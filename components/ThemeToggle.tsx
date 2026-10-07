'use client';
import { useEffect } from 'react';
import Button from '@/components/ui/Button';
import { applyTheme, currentTheme, getStoredTheme, storeTheme, systemTheme } from '@/lib/theme';

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

/**
 * ライト/ダーク切替。初期テーマは app/layout.tsx のインラインスクリプトが
 * 描画前に <html> の class へ反映済み。ラベルは `dark:` で出し分けるので
 * サーバー描画との差分（hydration mismatch）は出ない。
 */
export default function ThemeToggle() {
  // 明示的に選んでいない間は OS の設定変更に追従する
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (getStoredTheme() === null) applyTheme(systemTheme());
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  function toggle() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    storeTheme(next);
  }

  return (
    <Button variant="outline" size="sm" onClick={toggle} title="ライト/ダークを切り替え" className="gap-1.5">
      <span className="inline-flex items-center gap-1.5 dark:hidden">
        <SunIcon />
        ライト
      </span>
      <span className="hidden items-center gap-1.5 dark:inline-flex">
        <MoonIcon />
        ダーク
      </span>
      <span className="sr-only">（クリックで切り替え）</span>
    </Button>
  );
}
