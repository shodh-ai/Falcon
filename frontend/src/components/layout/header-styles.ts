/** Shared styling for top-bar controls (search, actions, notifications, etc.) */
export const HEADER_CONTROL_CLASS =
  'h-11 shrink-0 rounded-lg border border-sgvu-navy/10 bg-white text-sgvu-navy shadow-none hover:border-sgvu-gold/45 hover:bg-sgvu-surface/60 sm:h-10';

export const HEADER_ICON_CONTROL_CLASS = `${HEADER_CONTROL_CLASS} w-11 px-0 sm:w-10`;

export const HEADER_SEARCH_CLASS =
  'hidden h-10 min-w-[10rem] max-w-[14rem] items-center gap-2 rounded-lg border border-sgvu-navy/10 bg-white px-3 text-sm text-muted-foreground shadow-none transition hover:border-sgvu-gold/45 hover:bg-sgvu-surface/60 hover:text-sgvu-navy sm:flex lg:min-w-[12rem] xl:max-w-none';

export const HEADER_SEARCH_MOBILE_CLASS =
  'flex h-11 w-11 items-center justify-center rounded-lg border border-sgvu-navy/10 bg-white text-sgvu-navy shadow-none transition hover:border-sgvu-gold/45 hover:bg-sgvu-surface/60 sm:hidden';
