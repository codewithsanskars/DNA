import { ReactNode, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { workflowApi } from '../../api/workflow.api';
import { queryKeys } from '../../api/queryKeys';
import { useAuth } from '../../context/AuthContext';
import { useStaff } from '../../hooks/useWorkflow';
import { NoteKind, RecordType, StaffUser } from '../../types';
import { NOTE_KIND_META } from '../../utils/labels';
import { timeAgo, formatDateTime } from '../../utils/format';
import { errorMessage } from '../../utils/errors';
import Button from '../shared/Button';
import Icon from '../shared/Icon';
import Avatar from '../shared/Avatar';
import { useToast } from '../shared/Toast';
import { useConfirm } from '../shared/Confirm';

const KINDS: NoteKind[] = ['NOTE', 'CALL', 'EMAIL', 'MEETING', 'FOLLOW_UP'];

/** Renders note text with @mentions of known staff highlighted. */
export function NoteBody({ body, staff }: { body: string; staff: StaffUser[] }) {
  const parts = useMemo(() => {
    const names = staff.map((s) => s.name).filter(Boolean).sort((a, b) => b.length - a.length);
    if (!names.length) return [body];
    const re = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'g');
    return body.split(re);
  }, [body, staff]);
  return (
    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
      {parts.map((p, i) =>
        p.startsWith('@') && i % 2 === 1 ? (
          <span key={i} className="rounded bg-brand-subtle px-0.5 font-medium text-brand-text">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </p>
  );
}

/**
 * Activity timeline for any record (RC-19 / RC-20 / RC-74 / RC-75): add
 * notes or log calls, emails, meetings and follow-ups, with @mentions of
 * SWFS teammates. Logging a call/email/meeting on a candidate bumps their
 * "last contacted" date. Admin-only — the API rejects client sessions.
 */
export default function RecordTimeline({
  recordType,
  recordId,
  title = 'Activity',
  extra,
}: {
  recordType: RecordType;
  recordId: string;
  title?: string;
  /** Rendered under the header (e.g. "Last contacted 3d ago"). */
  extra?: ReactNode;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: staff = [] } = useStaff();
  const [kind, setKind] = useState<NoteKind>('NOTE');
  const [body, setBody] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentioned, setMentioned] = useState<Record<string, string>>({}); // name -> id
  const textRef = useRef<HTMLTextAreaElement>(null);

  const key = queryKeys.notes(recordType, recordId);
  const { data: notes = [], isLoading } = useQuery({ queryKey: key, queryFn: () => workflowApi.getNotes(recordType, recordId) });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: key });
    if (recordType === 'candidate') {
      queryClient.invalidateQueries({ queryKey: queryKeys.candidate(recordId) });
    }
  };

  const add = useMutation({
    mutationFn: () =>
      workflowApi.addNote({
        recordType,
        recordId,
        kind,
        body: body.trim(),
        occurredAt: kind !== 'NOTE' && occurredAt ? new Date(occurredAt).toISOString() : undefined,
        mentions: Object.entries(mentioned)
          .filter(([name]) => body.includes(`@${name}`))
          .map(([, id]) => id),
      }),
    onSuccess: () => {
      setBody('');
      setOccurredAt('');
      setMentioned({});
      invalidate();
      toast.success(kind === 'NOTE' ? 'Note added' : `${NOTE_KIND_META[kind].label} logged`);
    },
    onError: (err) => toast.error('Couldn’t save', errorMessage(err, 'Please try again.')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => workflowApi.deleteNote(id),
    onSuccess: invalidate,
    onError: (err) => toast.error('Couldn’t delete', errorMessage(err, 'Please try again.')),
  });

  // @mention autocomplete: track the "@partial" word left of the caret.
  const onBodyChange = (value: string) => {
    setBody(value);
    const caret = textRef.current?.selectionStart ?? value.length;
    const match = value.slice(0, caret).match(/(?:^|\s)@([\w.-]*)$/);
    setMentionQuery(match ? match[1].toLowerCase() : null);
  };

  const suggestions =
    mentionQuery === null
      ? []
      : staff
          .filter((s) => s.id !== user?.userId)
          .filter((s) => s.name.toLowerCase().includes(mentionQuery) || s.email.toLowerCase().includes(mentionQuery))
          .slice(0, 5);

  const pickMention = (s: StaffUser) => {
    const el = textRef.current;
    const caret = el?.selectionStart ?? body.length;
    const before = body.slice(0, caret).replace(/@([\w.-]*)$/, `@${s.name} `);
    const next = before + body.slice(caret);
    setBody(next);
    setMentioned((m) => ({ ...m, [s.name]: s.id }));
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  return (
    <section className="rounded-lg border border-border bg-card shadow-xs">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          {title}
          {notes.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 text-2xs font-medium text-muted-foreground ring-1 ring-inset ring-border">
              {notes.length}
            </span>
          )}
        </h3>
        <span className="text-2xs text-subtle-foreground">Internal · not visible to clients</span>
      </header>
      {extra && <div className="border-b border-border px-4 py-2">{extra}</div>}

      {/* Composer */}
      <div className="border-b border-border p-4">
        <div className="mb-2 flex flex-wrap gap-1" role="tablist" aria-label="Entry type">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                kind === k ? 'bg-muted text-foreground ring-1 ring-inset ring-border' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon name={NOTE_KIND_META[k].icon} size={13} />
              {NOTE_KIND_META[k].label}
            </button>
          ))}
        </div>
        <div className="relative">
          <textarea
            ref={textRef}
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            onKeyDown={(e) => {
              if (suggestions.length && (e.key === 'Enter' || e.key === 'Tab')) {
                e.preventDefault();
                pickMention(suggestions[0]);
              } else if (e.key === 'Escape') setMentionQuery(null);
              else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && body.trim()) add.mutate();
            }}
            rows={3}
            placeholder={
              kind === 'NOTE' ? 'Add a note… type @ to mention a teammate' : `What happened on this ${NOTE_KIND_META[kind].label.toLowerCase()}?`
            }
            className="w-full resize-none rounded-md border border-border-strong bg-card px-3 py-2 text-sm text-foreground placeholder:text-subtle-foreground focus:border-brand/70 focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          {suggestions.length > 0 && (
            <ul className="absolute left-2 top-full z-20 mt-1 w-64 overflow-hidden rounded-md border border-border bg-card shadow-lg">
              {suggestions.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickMention(s);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted ${i === 0 ? 'bg-muted/60' : ''}`}
                  >
                    <Avatar name={s.name} size="xs" imageUrl={s.avatarUrl} />
                    <span className="font-medium text-foreground">{s.name}</span>
                    <span className="truncate text-subtle-foreground">{s.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {kind !== 'NOTE' ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              When
              <input
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className="h-8 rounded-md border border-border-strong bg-card px-2 text-xs text-foreground"
              />
              <span className="text-subtle-foreground">(defaults to now)</span>
            </label>
          ) : (
            <span className="text-2xs text-subtle-foreground">⌘/Ctrl + Enter to save</span>
          )}
          <Button size="sm" variant="primary" disabled={!body.trim()} loading={add.isPending} onClick={() => add.mutate()}>
            {kind === 'NOTE' ? 'Add note' : `Log ${NOTE_KIND_META[kind].label.toLowerCase()}`}
          </Button>
        </div>
      </div>

      {/* Entries */}
      {isLoading ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">No activity yet. Notes and logged calls will appear here.</p>
      ) : (
        <ol className="divide-y divide-border">
          {notes.map((n) => {
            const meta = NOTE_KIND_META[n.kind];
            const mine = n.author.id === user?.userId;
            return (
              <li key={n.id} className="group flex gap-3 px-4 py-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-inset ring-border">
                  <Icon name={meta.icon} size={13} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{n.author.name}</span> {meta.verb} ·{' '}
                    <time title={formatDateTime(n.occurredAt)}>{timeAgo(n.occurredAt)}</time>
                  </p>
                  <div className="mt-1">
                    <NoteBody body={n.body} staff={staff} />
                  </div>
                </div>
                {mine && (
                  <button
                    type="button"
                    aria-label="Delete entry"
                    onClick={async () => {
                      const ok = await confirm({ title: 'Delete this entry?', confirmLabel: 'Delete', tone: 'danger' });
                      if (ok) remove.mutate(n.id);
                    }}
                    className="shrink-0 self-start rounded p-1 text-subtle-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                  >
                    <Icon name="trash" size={13} />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
