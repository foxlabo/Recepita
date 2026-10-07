import React from 'react';
import { cn } from '@/lib/cn';

type Props = React.InputHTMLAttributes<HTMLInputElement>;

export default function Input({ className, ...rest }: Props) {
  return (
    <input
      className={cn('w-full rounded-md border border-(--border) bg-white dark:bg-(--card) px-3 py-2', className)}
      {...rest}
    />
  );
}
