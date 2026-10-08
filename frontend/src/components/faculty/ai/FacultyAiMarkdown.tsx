'use client';

import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

function safeHref(href?: string) {
  if (!href) return undefined;
  const trimmed = href.trim();
  if (/^(https?:|mailto:|\/)/i.test(trimmed)) return trimmed;
  return undefined;
}

const markdownComponents: Components = {
  a: ({ href, children, ...props }) => {
    const safe = safeHref(href);
    if (!safe) {
      return <span {...props}>{children}</span>;
    }
    const external = /^https?:/i.test(safe);
    return (
      <a
        {...props}
        href={safe}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer nofollow' : undefined}
      >
        {children}
      </a>
    );
  },
};

export function FacultyAiMarkdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'faculty-ai-md max-w-none text-sm leading-relaxed text-sgvu-navy',
        '[&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-black',
        '[&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-bold',
        '[&_h3]:mb-1.5 [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-bold',
        '[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5',
        '[&_a]:font-semibold [&_a]:text-sgvu-navy [&_a]:underline',
        '[&_blockquote]:border-l-2 [&_blockquote]:border-sgvu-gold/50 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground',
        '[&_hr]:my-3 [&_hr]:border-border/70',
        '[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs',
        '[&_th]:border [&_th]:border-border/70 [&_th]:bg-slate-50 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-bold',
        '[&_td]:border [&_td]:border-border/70 [&_td]:px-2 [&_td]:py-1.5',
        '[&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px]',
        '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border/60 [&_pre]:bg-slate-950 [&_pre]:p-3 [&_pre]:text-[12px] [&_pre]:text-slate-100',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
