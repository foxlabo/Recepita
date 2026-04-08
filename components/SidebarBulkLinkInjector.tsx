'use client';

import { useEffect } from 'react';

export default function SidebarBulkLinkInjector() {
  useEffect(() => {
    try {
      const expensesLink = document.querySelector('a[href="/expenses"]') as HTMLAnchorElement | null;
      if (!expensesLink) return;

      const container = (expensesLink.parentElement && expensesLink.parentElement.parentElement) || expensesLink.parentElement;
      if (!container) return;
      if (container.querySelector('a[href="/expenses/bulk"]')) return;

      const wrapperTag = expensesLink.parentElement?.tagName?.toLowerCase() === 'li' ? 'li' : 'div';
      const wrapper = document.createElement(wrapperTag);
      const newLink = document.createElement('a');
      newLink.href = '/expenses/bulk';
      newLink.textContent = '一括登録';

      // 既存リンクの class を継承（あれば）。なければ中立の padding のみにする。
      const inherited = expensesLink.getAttribute('class');
      newLink.setAttribute('class', inherited && inherited.trim().length > 0 ? inherited : 'block px-3 py-2');

      wrapper.appendChild(newLink);
      if (expensesLink.parentElement?.nextSibling) {
        container.insertBefore(wrapper, expensesLink.parentElement.nextSibling);
      } else {
        container.appendChild(wrapper);
      }
    } catch (e) {
      console.warn('[SidebarBulkLinkInjector] skip:', e);
    }
  }, []);

  return null;
}
