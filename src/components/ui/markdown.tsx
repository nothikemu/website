import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { REF_PATTERN, PREFIX_TO_KIND, refUrl } from "@/lib/refs";
import { cn } from "@/lib/utils";

/**
 * Safe Markdown rendering. react-markdown never renders raw HTML, so user
 * content cannot inject script. Engineering references (REQ-001, TEST-012…)
 * and @mentions become links within the current project.
 */
function linkify(text: string, projectSlug?: string) {
  if (!projectSlug) return text;
  const out: React.ReactNode[] = [];
  let last = 0;
  const re = new RegExp(`${REF_PATTERN.source}|(?<![\\w@])@([a-z0-9][a-z0-9-]{0,38})`, "g");
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      const kind = PREFIX_TO_KIND[m[1]]!;
      out.push(
        <Link key={m.index} href={refUrl(projectSlug, kind, Number(m[2]))} className="rounded-sm bg-surface-2 px-1 font-mono text-[0.85em] font-medium text-fg no-underline ring-1 ring-border hover:ring-accent">
          {m[0]}
        </Link>,
      );
    } else {
      out.push(
        <span key={m.index} className="font-medium text-accent">
          {m[0]}
        </span>,
      );
    }
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ children, projectSlug, className }: { children: string | null | undefined; projectSlug?: string; className?: string }) {
  if (!children) return null;
  return (
    <div className={cn("prose-forge", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }) => {
            const safe = href && /^(https?:|\/|#|mailto:)/i.test(href) ? href : undefined;
            const external = safe?.startsWith("http");
            return (
              <a href={safe} {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}>
                {children}
              </a>
            );
          },
          img: ({ src, alt }) => {
            const s = typeof src === "string" && /^(https:|\/api\/)/.test(src) ? src : undefined;
            // eslint-disable-next-line @next/next/no-img-element
            return s ? <img src={s} alt={alt ?? ""} loading="lazy" /> : null;
          },
          p: ({ children }) => <p>{mapChildren(children, projectSlug)}</p>,
          li: ({ children }) => <li>{mapChildren(children, projectSlug)}</li>,
          td: ({ children }) => <td>{mapChildren(children, projectSlug)}</td>,
          strong: ({ children }) => <strong>{mapChildren(children, projectSlug)}</strong>,
          em: ({ children }) => <em>{mapChildren(children, projectSlug)}</em>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function mapChildren(children: React.ReactNode, slug?: string): React.ReactNode {
  if (typeof children === "string") return linkify(children, slug);
  if (Array.isArray(children)) return children.map((c, i) => (typeof c === "string" ? <span key={i}>{linkify(c, slug)}</span> : c));
  return children;
}
