import type React from 'react';
import { cn } from '@/lib/cn';

type Props = Omit<React.ComponentProps<'input'>, 'type'>;

/**
 * Native <input type="file"> whose browser button (「ファイルを選択」) is styled
 * like the outline Button (border / card background / hover, both themes)
 * through Tailwind's `file:` variant. It stays a real file input, so the
 * label association (<label htmlFor>), keyboard access and the chosen file
 * name shown by the browser keep working.
 */
export default function FileInput({ className, ...rest }: Props) {
  return (
    <input
      type="file"
      className={cn(
        // w-88: room for the browser's 「ファイルが選択されていません」 next to the padded button
        'block w-88 max-w-full cursor-pointer rounded-md text-sm text-(--muted)',
        'file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-solid file:border-(--border)',
        'file:bg-(--card) file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-(--fg) file:transition-colors',
        'hover:file:bg-(--muted-bg) dark:hover:file:bg-[#16211e]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-recepita dark:focus-visible:outline-green-400',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:file:cursor-not-allowed',
        className,
      )}
      {...rest}
    />
  );
}
