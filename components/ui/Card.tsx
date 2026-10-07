import type React from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('bg-(--card) border border-(--border) rounded-xl shadow-card', className)} {...rest} />;
}
export function CardHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div className="p-4 border-b border-(--border)" {...props} />;
}
export function CardContent(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div className="p-4" {...props} />;
}
