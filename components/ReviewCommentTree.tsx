"use client";

import {
  createReviewComment,
  deleteReviewComment,
  updateReviewComment,
} from "@/app/actions/pins";
import { AvatarImg } from "@/components/AvatarImg";
import { NormReminder } from "@/components/NormReminder";
import { useState } from "react";

export type ThreadComment = {
  id: string;
  review_id: string;
  author_id: string;
  body: string;
  created_at: string;
  parent_id?: string | null;
  thread_anchor_user_id?: string | null;
};

type AuthorInfo = { display_name: string; avatar_url: string | null };

function buildChildrenMap(rows: ThreadComment[]) {
  const m = new Map<string | null, ThreadComment[]>();
  for (const c of rows) {
    const k = c.parent_id ?? null;
    const list = m.get(k) ?? [];
    list.push(c);
    m.set(k, list);
  }
  for (const [, list] of m) {
    list.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }
  return m;
}

function Branch({
  comment,
  depth,
  childrenMap,
  authors,
  anchorNames,
  myUserId,
  onRefresh,
}: {
  comment: ThreadComment;
  depth: number;
  childrenMap: Map<string | null, ThreadComment[]>;
  authors: Map<string, AuthorInfo>;
  anchorNames: Map<string, string>;
  myUserId: string;
  onRefresh: () => void;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const kids = childrenMap.get(comment.id) ?? [];
  const a = authors.get(comment.author_id);
  const anchorLabel =
    comment.thread_anchor_user_id &&
    anchorNames.get(comment.thread_anchor_user_id);

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyBody.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await createReviewComment({
        reviewId: comment.review_id,
        body: replyBody,
        parentId: comment.id,
      });
      setReplyBody("");
      setReplyOpen(false);
      onRefresh();
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editBody.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await updateReviewComment(comment.id, editBody);
      setEditOpen(false);
      onRefresh();
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this comment?")) return;
    setBusy(true);
    try {
      await deleteReviewComment(comment.id);
      onRefresh();
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={depth > 0 ? "mt-3 border-l-2 border-emerald-200/80 pl-3 dark:border-emerald-900/60" : ""}>
      <div className="rounded-2xl border border-zinc-200/80 bg-white/60 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/40">
        {anchorLabel ? (
          <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Thread: {anchorLabel}
          </p>
        ) : null}
        <div className="flex gap-2">
          <AvatarImg
            src={a?.avatar_url}
            alt={a?.display_name ?? "Member"}
            size={32}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-zinc-500">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                {a?.display_name ?? "Member"}
              </span>
              <span>{new Date(comment.created_at).toLocaleString()}</span>
            </div>
            {editOpen ? (
              <form onSubmit={(e) => void saveEdit(e)} className="mt-2 space-y-2">
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-zinc-200/90 bg-white/70 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900/50"
                />
                {err ? (
                  <p className="text-xs text-red-600 dark:text-red-400">{err}</p>
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg bg-emerald-600 px-2 py-1 text-xs text-white"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditOpen(false);
                      setEditBody(comment.body);
                    }}
                    className="text-xs text-zinc-500"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200">
                {comment.body}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setReplyOpen((v) => !v)}
                className="text-xs font-medium text-emerald-700 dark:text-emerald-400"
              >
                Reply
              </button>
              {comment.author_id === myUserId && !editOpen ? (
                <>
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove()}
                    className="text-xs text-red-600 dark:text-red-400"
                  >
                    Delete
                  </button>
                </>
              ) : null}
            </div>
            {replyOpen ? (
              <form
                onSubmit={(e) => void submitReply(e)}
                className="mt-3 space-y-2 border-t border-zinc-200/60 pt-3 dark:border-zinc-700"
              >
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Write a reply…"
                  rows={2}
                  className="w-full rounded-xl border border-zinc-200/90 bg-white/70 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900/50"
                />
                {err ? (
                  <p className="text-xs text-red-600 dark:text-red-400">{err}</p>
                ) : null}
                <button
                  type="submit"
                  disabled={busy || !replyBody.trim()}
                  className="rounded-lg bg-emerald-600 px-3 py-1 text-xs text-white disabled:opacity-50"
                >
                  Post reply
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </div>
      {kids.length > 0 ? (
        <ul className="mt-1 list-none">
          {kids.map((ch) => (
            <Branch
              key={ch.id}
              comment={ch}
              depth={depth + 1}
              childrenMap={childrenMap}
              authors={authors}
              anchorNames={anchorNames}
              myUserId={myUserId}
              onRefresh={onRefresh}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function ReviewCommentTree({
  reviewId,
  comments,
  memberSummaries,
  authors,
  myUserId,
  threadAnchorUserId,
  onThreadAnchorChange,
  onRefresh,
}: {
  reviewId: string;
  comments: ThreadComment[];
  memberSummaries: { user_id: string }[];
  authors: Map<string, AuthorInfo>;
  myUserId: string;
  /** When set, new top-level comments are threaded to this member summary. */
  threadAnchorUserId: string | null;
  onThreadAnchorChange: (userId: string | null) => void;
  onRefresh: () => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const childrenMap = buildChildrenMap(comments);
  const roots = (childrenMap.get(null) ?? []).filter(Boolean);

  const anchorNames = new Map<string, string>();
  for (const m of memberSummaries) {
    const name = authors.get(m.user_id)?.display_name ?? "Member";
    anchorNames.set(m.user_id, name);
  }

  async function submitTop(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await createReviewComment({
        reviewId,
        body,
        parentId: null,
        threadAnchorUserId: threadAnchorUserId,
      });
      setBody("");
      onThreadAnchorChange(null);
      onRefresh();
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 border-t border-zinc-200/80 pt-6 dark:border-zinc-700">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700/90 dark:text-emerald-300">
        Discussion
      </p>
      <ul className="mt-3 list-none space-y-3">
        {roots.length === 0 ? (
          <li className="text-sm text-zinc-500">No comments yet.</li>
        ) : (
          roots.map((c) => (
            <Branch
              key={c.id}
              comment={c}
              depth={0}
              childrenMap={childrenMap}
              authors={authors}
              anchorNames={anchorNames}
              myUserId={myUserId}
              onRefresh={onRefresh}
            />
          ))
        )}
      </ul>
      <form onSubmit={(e) => void submitTop(e)} className="mt-4 space-y-2">
        <NormReminder context="review" />
        {threadAnchorUserId ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3 py-2 text-xs dark:border-emerald-900 dark:bg-emerald-950/40">
            <span className="text-emerald-900 dark:text-emerald-200">
              Comment on{" "}
              <strong>
                {authors.get(threadAnchorUserId)?.display_name ??
                  "this perspective"}
              </strong>
              &apos;s take
            </span>
            <button
              type="button"
              className="text-emerald-800 underline dark:text-emerald-300"
              onClick={() => onThreadAnchorChange(null)}
            >
              Clear
            </button>
          </div>
        ) : (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Optional: select someone under &quot;Everyone&apos;s take&quot;
            above to thread your comment to their review.
          </p>
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          rows={3}
          className="w-full rounded-xl border border-zinc-200/90 bg-white/70 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900/50"
        />
        {err ? (
          <p className="text-sm text-red-600 dark:text-red-400">{err}</p>
        ) : null}
        <button
          type="submit"
          disabled={busy || !body.trim()}
          className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Posting…" : "Post comment"}
        </button>
      </form>
    </div>
  );
}
