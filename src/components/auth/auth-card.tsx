import type { ReactNode } from "react";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="animate-slide-up">
      <h1 className="text-xl font-semibold tracking-[-0.02em]">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-fg-muted">{subtitle}</p> : null}
      <div className="mt-6 rounded-lg border border-border bg-surface p-5 shadow-[var(--shadow)]">{children}</div>
      {footer ? <div className="mt-4 text-center text-sm text-fg-muted">{footer}</div> : null}
    </div>
  );
}

export function OAuthButtons({ github, google, next }: { github: boolean; google: boolean; next?: string }) {
  if (!github && !google) return null;
  const q = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <>
      <div className="grid gap-2">
        {github ? (
          <a href={`/api/auth/oauth/github${q}`} className="flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-surface-2 text-sm font-medium hover:border-border-strong hover:bg-surface-3">
            <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Continue with GitHub
          </a>
        ) : null}
        {google ? (
          <a href={`/api/auth/oauth/google${q}`} className="flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-surface-2 text-sm font-medium hover:border-border-strong hover:bg-surface-3">
            <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
              <path fill="#4285F4" d="M15.68 8.18c0-.57-.05-1.11-.15-1.64H8v3.1h4.3a3.68 3.68 0 0 1-1.6 2.41v2h2.59c1.51-1.4 2.39-3.45 2.39-5.87z" />
              <path fill="#34A853" d="M8 16c2.16 0 3.97-.72 5.29-1.94l-2.59-2c-.71.48-1.63.77-2.7.77-2.08 0-3.84-1.4-4.47-3.29H.86v2.07A8 8 0 0 0 8 16z" />
              <path fill="#FBBC05" d="M3.53 9.54a4.8 4.8 0 0 1 0-3.08V4.39H.86a8 8 0 0 0 0 7.22l2.67-2.07z" />
              <path fill="#EA4335" d="M8 3.18c1.17 0 2.23.4 3.06 1.2l2.29-2.3A7.98 7.98 0 0 0 .86 4.4l2.67 2.07C4.16 4.57 5.92 3.18 8 3.18z" />
            </svg>
            Continue with Google
          </a>
        ) : null}
      </div>
      <div className="my-4 flex items-center gap-3 text-2xs tracking-wide text-fg-subtle uppercase">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}
