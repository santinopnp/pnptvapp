import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import type { Components } from "react-markdown";

interface MentionTextProps {
  text: string | null | undefined;
  className?: string;
  /** Collapse text beyond this character count with a "View more" toggle */
  maxLength?: number;
  /**
   * Server-resolved list of every `@username` token found in `text`. `user_id: null`
   * means the mention doesn't resolve to a real account — rendered as plain text.
   * When absent, every `@word` renders as a clickable link (legacy behavior).
   */
  resolvedMentions?: Array<{ username: string; user_id: string | null }>;
}

function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.lastIndexOf(" ", max);
  return (cut > max * 0.4 ? text.slice(0, cut) : text.slice(0, max)).trimEnd();
}

/**
 * Pre-process: converts @mention and #hashtag tokens to markdown link syntax so
 * remark handles them as links. URL autolinks are handled by remark-gfm.
 */
function preprocessTokens(
  text: string,
  mentionLookup: Map<string, string | null> | null,
): string {
  return text.replace(
    /(@[a-zA-Z0-9_]{2,32}|#[a-zA-Z0-9_À-ɏ]{1,64})/g,
    (match) => {
      if (match.startsWith("@")) {
        const username = match.slice(1);
        if (mentionLookup) {
          const resolvedId = mentionLookup.get(username.toLowerCase());
          if (!resolvedId) return match; // unresolved — keep as plain text
        }
        return `[@${username}](/profile/${username})`;
      }
      const tag = match.slice(1);
      return `[${match}](/?tag=${encodeURIComponent(tag)})`;
    },
  );
}

/**
 * Renders post/message text with full GFM markdown, @mention, #hashtag, and URL support.
 * Single newlines become line breaks (remark-breaks); double newlines become paragraphs.
 */
export function MentionText({ text, className, maxLength, resolvedMentions }: MentionTextProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  // All hooks must be called before any conditional return.
  const mentionLookup = useMemo<Map<string, string | null> | null>(
    () =>
      resolvedMentions
        ? new Map(resolvedMentions.map((m) => [m.username.toLowerCase(), m.user_id]))
        : null,
    [resolvedMentions],
  );

  const needsTruncation = !!maxLength && !!text && text.length > maxLength;
  const displayText =
    needsTruncation && !expanded ? truncateAtWord(text!, maxLength!) : text ?? "";

  const processed = useMemo(
    () => (text ? preprocessTokens(displayText, mentionLookup) : ""),
    [displayText, mentionLookup, text],
  );

  const components = useMemo<Components>(
    () => ({
      // Render paragraphs as inline-block spans so they sit flush inside the card.
      p: ({ children }) => <span className="block mb-1 last:mb-0">{children}</span>,

      a: ({ href, children }) => {
        if (href?.startsWith("/")) {
          const color = href.startsWith("/profile/")
            ? "#5ED1C4"
            : href.startsWith("/?tag=")
              ? "#D4007A"
              : "#5ED1C4";
          return (
            <span
              className="font-medium cursor-pointer hover:underline"
              style={{ color }}
              onClick={(e) => {
                e.stopPropagation();
                navigate(href!);
              }}
            >
              {children}
            </span>
          );
        }
        const trimmed = (href ?? "").replace(/[.,;:!?)\]]+$/, "");
        return (
          <a
            href={trimmed}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="underline underline-offset-2 decoration-1 font-medium break-all inline-flex items-center gap-0.5"
            style={{ color: "#5ED1C4" }}
          >
            {children}
            <svg
              aria-hidden="true"
              className="w-3 h-3 flex-shrink-0 inline-block"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        );
      },

      strong: ({ children }) => (
        <strong className="font-semibold text-white">{children}</strong>
      ),
      em: ({ children }) => <em className="italic">{children}</em>,
      del: ({ children }) => <del className="line-through opacity-70">{children}</del>,

      // Inline code gets pill styling; block code (inside pre) gets transparent
      // background via the [&>code] selector on pre so styles don't stack.
      code: ({ children, className: codeClass }) => (
        <code
          className={`font-mono text-xs${
            codeClass
              ? ` ${codeClass}`
              : " px-1.5 py-0.5 rounded bg-white/10 text-[#E2E2E2]"
          }`}
        >
          {children}
        </code>
      ),

      pre: ({ children }) => (
        <pre className="my-2 p-3 rounded-lg overflow-x-auto bg-white/[0.06] text-[#E2E2E2] text-xs font-mono [&>code]:bg-transparent [&>code]:p-0 [&>code]:rounded-none">
          {children}
        </pre>
      ),

      h1: ({ children }) => (
        <div className="text-lg font-bold text-white mt-2 mb-1">{children}</div>
      ),
      h2: ({ children }) => (
        <div className="text-base font-bold text-white mt-2 mb-1">{children}</div>
      ),
      h3: ({ children }) => (
        <div className="text-sm font-bold text-white mt-1.5 mb-0.5">{children}</div>
      ),

      ul: ({ children }) => (
        <ul className="list-disc list-inside my-1 space-y-0.5 text-sm">{children}</ul>
      ),
      ol: ({ children }) => (
        <ol className="list-decimal list-inside my-1 space-y-0.5 text-sm">{children}</ol>
      ),
      li: ({ children }) => <li className="text-white/90">{children}</li>,

      blockquote: ({ children }) => (
        <blockquote
          className="border-l-2 border-white/30 pl-3 my-1.5 italic"
          style={{ color: "rgba(255,255,255,0.65)" }}
        >
          {children}
        </blockquote>
      ),

      hr: () => <hr className="border-white/20 my-2" />,

      table: ({ children }) => (
        <div className="overflow-x-auto my-2">
          <table className="text-sm w-full border-collapse">{children}</table>
        </div>
      ),
      thead: ({ children }) => <thead>{children}</thead>,
      tbody: ({ children }) => <tbody>{children}</tbody>,
      tr: ({ children }) => <tr className="border-b border-white/10">{children}</tr>,
      th: ({ children }) => (
        <th className="text-left px-2 py-1 font-semibold text-white">{children}</th>
      ),
      td: ({ children }) => <td className="px-2 py-1 text-white/80">{children}</td>,
    }),
    [navigate],
  );

  if (!text) return <div className={className} />;

  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {processed}
      </ReactMarkdown>
      {needsTruncation && !expanded && (
        <>
          {"... "}
          <span
            className="font-medium cursor-pointer hover:underline"
            style={{ color: "#5ED1C4" }}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(true);
            }}
          >
            View more
          </span>
        </>
      )}
    </div>
  );
}
