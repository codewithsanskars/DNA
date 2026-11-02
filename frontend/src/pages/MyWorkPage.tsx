import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppLayout from '../components/layout/AppLayout';
import { TaskForm, TaskItem } from '../components/workflow/Tasks';
import { NoteBody } from '../components/workflow/RecordTimeline';
import Icon from '../components/shared/Icon';
import { workflowApi } from '../api/workflow.api';
import { pipelineApi } from '../api/pipeline.api';
import { queryKeys } from '../api/queryKeys';
import { useStaff } from '../hooks/useWorkflow';
import { Task } from '../types';
import { formatDateTime, timeAgo } from '../utils/format';
import { INTERVIEW_MODE_LABELS } from '../utils/labels';

type Scope = 'mine' | 'created' | 'all';

function bucketTasks(tasks: Task[]) {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const endOfWeek = new Date(endOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  const open = tasks.filter((t) => t.status === 'OPEN');
  return {
    overdue: open.filter((t) => t.dueAt && new Date(t.dueAt) < now),
    today: open.filter((t) => t.dueAt && new Date(t.dueAt) >= now && new Date(t.dueAt) <= endOfToday),
    week: open.filter((t) => t.dueAt && new Date(t.dueAt) > endOfToday && new Date(t.dueAt) <= endOfWeek),
    later: open.filter((t) => t.dueAt && new Date(t.dueAt) > endOfWeek),
    noDate: open.filter((t) => !t.dueAt),
    done: tasks.filter((t) => t.status === 'DONE').slice(0, 15),
  };
}

function Group({ title, tasks, tone, defaultOpen = true }: { title: string; tasks: Task[]; tone?: 'danger'; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!tasks.length) return null;
  return (
    <div className="border-b border-border last:border-0">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left">
        <Icon name="chevron-down" size={14} className={`text-subtle-foreground transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className={`text-xs font-semibold uppercase tracking-wide ${tone === 'danger' ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}`}>{title}</span>
        <span className="rounded-full bg-muted px-1.5 text-2xs font-medium text-muted-foreground ring-1 ring-inset ring-border">{tasks.length}</span>
      </button>
      {open && (
        <ul className="divide-y divide-border border-t border-border">
          {tasks.map((t) => (
            <TaskItem key={t.id} task={t} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * "My Work" (RC-71): a recruiter's day — overdue and upcoming tasks,
 * @mentions, and interviews in the next two weeks. SWFS staff only.
 */
export default function MyWorkPage() {
  const [scope, setScope] = useState<Scope>('mine');
  const { data: staff = [] } = useStaff();
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: queryKeys.tasks({ scope }),
    queryFn: () => workflowApi.getTasks({ scope }),
  });
  const { data: mentions = [] } = useQuery({ queryKey: queryKeys.mentions, queryFn: workflowApi.getMentions });
  const { data: interviews = [] } = useQuery({ queryKey: queryKeys.upcomingInterviews, queryFn: () => pipelineApi.getUpcomingInterviews(14) });
  const b = bucketTasks(tasks);
  const openCount = tasks.filter((t) => t.status === 'OPEN').length;

  return (
    <AppLayout title="My Work">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Stat strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Overdue', b.overdue.length, b.overdue.length ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'],
              ['Due today', b.today.length, 'text-foreground'],
              ['This week', b.week.length, 'text-foreground'],
              ['Open', openCount, 'text-foreground'],
            ].map(([label, n, cls]) => (
              <div key={label as string} className="rounded-lg border border-border bg-card p-3 shadow-xs">
                <p className="text-2xs font-medium uppercase tracking-wide text-subtle-foreground">{label}</p>
                <p className={`mt-1 text-2xl font-semibold tabular-nums ${cls}`}>{n as number}</p>
              </div>
            ))}
          </div>

          <section className="rounded-lg border border-border bg-card shadow-xs">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="text-[13px] font-semibold text-foreground">Tasks</h2>
              <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Whose tasks">
                {(
                  [
                    ['mine', 'Assigned to me'],
                    ['created', 'Created by me'],
                    ['all', 'Everyone'],
                  ] as const
                ).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={scope === k}
                    onClick={() => setScope(k)}
                    className={`rounded px-2 py-1 text-xs font-medium ${scope === k ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </header>
            <div className="border-b border-border p-4">
              <TaskForm compact />
            </div>
            {isLoading ? (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">Loading…</p>
            ) : openCount === 0 && !b.done.length ? (
              <div className="px-4 py-12 text-center">
                <Icon name="check-square" size={22} className="mx-auto text-subtle-foreground" />
                <p className="mt-2 text-sm font-medium text-foreground">You’re all caught up</p>
                <p className="mt-1 text-xs text-muted-foreground">Add follow-ups here or from any candidate, role or client.</p>
              </div>
            ) : (
              <>
                <Group title="Overdue" tasks={b.overdue} tone="danger" />
                <Group title="Today" tasks={b.today} />
                <Group title="Next 7 days" tasks={b.week} />
                <Group title="Later" tasks={b.later} />
                <Group title="No due date" tasks={b.noDate} />
                <Group title="Recently completed" tasks={b.done} defaultOpen={false} />
              </>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-card shadow-xs">
            <header className="border-b border-border px-4 py-3">
              <h2 className="text-[13px] font-semibold text-foreground">Upcoming interviews</h2>
            </header>
            {interviews.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">Nothing in the next 14 days.</p>
            ) : (
              <ul className="divide-y divide-border">
                {interviews.map((i) => (
                  <li key={i.id} className="px-4 py-2.5">
                    <Link to={`/candidates/${i.candidateId}`} className="text-[13px] font-medium text-foreground hover:underline">
                      {i.candidateName}
                    </Link>
                    <p className="text-2xs text-subtle-foreground">
                      {formatDateTime(i.scheduledAt)} · R{i.round} · {INTERVIEW_MODE_LABELS[i.mode]}
                    </p>
                    <p className="truncate text-2xs text-subtle-foreground">
                      {i.jobTitle}
                      {i.organizationName && ` · ${i.organizationName}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card shadow-xs">
            <header className="border-b border-border px-4 py-3">
              <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                <Icon name="at" size={14} /> Mentions
              </h2>
            </header>
            {mentions.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">No one has mentioned you yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {mentions.map((m) => (
                  <li key={m.id} className="px-4 py-3">
                    <p className="text-2xs text-subtle-foreground">
                      <span className="font-medium text-foreground">{m.author.name}</span> · {timeAgo(m.createdAt)}
                      {m.recordLabel && (
                        <>
                          {' on '}
                          <Link
                            to={m.recordType === 'candidate' ? `/candidates/${m.recordId}` : m.recordType === 'job' ? `/jobs/${m.recordId}` : `/organization/${m.recordId}`}
                            className="text-brand-text hover:underline"
                          >
                            {m.recordLabel}
                          </Link>
                        </>
                      )}
                    </p>
                    <div className="mt-1 line-clamp-3">
                      <NoteBody body={m.body} staff={staff} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
