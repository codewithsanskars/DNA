import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { workflowApi, TaskInput } from '../../api/workflow.api';
import { queryKeys } from '../../api/queryKeys';
import { useAuth } from '../../context/AuthContext';
import { useStaff } from '../../hooks/useWorkflow';
import { RecordType, Task, TaskPriority, TaskRecurrence } from '../../types';
import { PRIORITY_LABELS, RECURRENCE_LABELS, dueLabel } from '../../utils/labels';
import { errorMessage } from '../../utils/errors';
import Button from '../shared/Button';
import Icon from '../shared/Icon';
import Badge from '../shared/Badge';
import { Input, Select } from '../shared/Field';
import { useToast } from '../shared/Toast';
import { useConfirm } from '../shared/Confirm';

const RECORD_PATH: Record<RecordType, (id: string) => string> = {
  candidate: (id) => `/candidates/${id}`,
  job: (id) => `/jobs/${id}`,
  organization: (id) => `/organization/${id}`,
};

/** `datetime-local` value for a date, in local time. */
function toLocalInput(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Quick-add presets — most follow-ups are "tomorrow morning" or "next week". */
function preset(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return toLocalInput(d.toISOString());
}

function useInvalidateTasks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.allTasks });
}

/** Create / edit form for a task (RC-70, RC-72, RC-73). */
export function TaskForm({
  task,
  recordType,
  recordId,
  onDone,
  compact,
}: {
  task?: Task;
  recordType?: RecordType;
  recordId?: string;
  onDone?: () => void;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const invalidate = useInvalidateTasks();
  const { data: staff = [] } = useStaff();
  const [title, setTitle] = useState(task?.title ?? '');
  const [dueAt, setDueAt] = useState(toLocalInput(task?.dueAt) || (task ? '' : preset(1)));
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'MEDIUM');
  const [recurrence, setRecurrence] = useState<TaskRecurrence>(task?.recurrence ?? 'NONE');
  const [assigneeId, setAssigneeId] = useState(task?.assignee?.id ?? user?.userId ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [showMore, setShowMore] = useState(!!task?.description);

  const save = useMutation({
    mutationFn: () => {
      const input: TaskInput = {
        title: title.trim(),
        description: description.trim() || null,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        priority,
        recurrence,
        assigneeId: assigneeId || null,
      };
      return task
        ? workflowApi.updateTask(task.id, input)
        : workflowApi.createTask({ ...input, title: input.title!, recordType, recordId });
    },
    onSuccess: () => {
      invalidate();
      toast.success(task ? 'Task updated' : 'Task added');
      if (!task) {
        setTitle('');
        setDescription('');
        setDueAt(preset(1));
      }
      onDone?.();
    },
    onError: (err) => toast.error('Couldn’t save the task', errorMessage(err, 'Please try again.')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (title.trim()) save.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={recordId ? 'Follow up on…' : 'What needs doing?'}
        aria-label="Task title"
        autoFocus={!compact}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex gap-1">
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            aria-label="Due"
            className="h-9 min-w-0 flex-1 rounded-md border border-border-strong bg-card px-2 text-xs text-foreground"
          />
          {!task && (
            <>
              <button type="button" onClick={() => setDueAt(preset(0))} className="rounded-md px-1.5 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground">
                Today
              </button>
              <button type="button" onClick={() => setDueAt(preset(7))} className="rounded-md px-1.5 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground">
                +1w
              </button>
            </>
          )}
        </div>
        <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} aria-label="Assignee">
          <option value="">Unassigned</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id === user?.userId ? `${s.name} (me)` : s.name}
            </option>
          ))}
        </Select>
      </div>
      {showMore ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} aria-label="Priority">
            {(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]} priority
              </option>
            ))}
          </Select>
          <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value as TaskRecurrence)} aria-label="Repeats">
            {(Object.keys(RECURRENCE_LABELS) as TaskRecurrence[]).map((r) => (
              <option key={r} value={r}>
                {RECURRENCE_LABELS[r]}
              </option>
            ))}
          </Select>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Details (optional)"
            className="rounded-md border border-border-strong bg-card px-3 py-2 text-sm text-foreground placeholder:text-subtle-foreground sm:col-span-2"
          />
        </div>
      ) : (
        <button type="button" onClick={() => setShowMore(true)} className="text-2xs font-medium text-muted-foreground hover:text-foreground">
          + Priority, repeat, details
        </button>
      )}
      <div className="flex justify-end gap-2">
        {onDone && task && (
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" variant="primary" disabled={!title.trim()} loading={save.isPending}>
          {task ? 'Save' : 'Add task'}
        </Button>
      </div>
    </form>
  );
}

/** One task row: checkbox, title, due chip, record link, assignee. */
export function TaskItem({ task, showRecord = true }: { task: Task; showRecord?: boolean }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const invalidate = useInvalidateTasks();
  const [editing, setEditing] = useState(false);
  const done = task.status === 'DONE';
  const due = done ? null : dueLabel(task.dueAt);

  const toggle = useMutation({
    mutationFn: async (): Promise<{ next?: Task | null }> =>
      done ? (await workflowApi.reopenTask(task.id), {}) : workflowApi.completeTask(task.id),
    onSuccess: (res) => {
      invalidate();
      const next = res.next;
      if (next?.dueAt) toast.success('Done — next one scheduled', new Date(next.dueAt).toLocaleDateString());
    },
    onError: (err) => toast.error('Couldn’t update the task', errorMessage(err, 'Please try again.')),
  });

  const remove = useMutation({
    mutationFn: () => workflowApi.deleteTask(task.id),
    onSuccess: invalidate,
  });

  if (editing) {
    return (
      <li className="px-4 py-3">
        <TaskForm task={task} onDone={() => setEditing(false)} compact />
      </li>
    );
  }

  return (
    <li className="group flex items-start gap-3 px-4 py-2.5">
      <button
        type="button"
        onClick={() => toggle.mutate()}
        disabled={toggle.isPending}
        aria-label={done ? 'Mark as not done' : 'Mark as done'}
        className={`mt-0.5 shrink-0 transition-colors ${done ? 'text-emerald-600 dark:text-emerald-400' : 'text-subtle-foreground hover:text-foreground'}`}
      >
        <Icon name={done ? 'check-square' : 'square'} size={17} />
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-[13px] ${done ? 'text-subtle-foreground line-through' : 'font-medium text-foreground'}`}>{task.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-subtle-foreground">
          {due && (
            <span
              className={`inline-flex items-center gap-1 ${
                due.tone === 'danger' ? 'font-semibold text-rose-600 dark:text-rose-400' : due.tone === 'warning' ? 'font-medium text-amber-700 dark:text-amber-400' : ''
              }`}
            >
              <Icon name="clock" size={11} /> {due.text}
            </span>
          )}
          {task.priority === 'HIGH' && !done && <Badge tone="danger">High</Badge>}
          {task.recurrence !== 'NONE' && (
            <span className="inline-flex items-center gap-1">
              <Icon name="repeat" size={11} /> {RECURRENCE_LABELS[task.recurrence]}
            </span>
          )}
          {showRecord && task.recordType && task.recordId && task.recordLabel && (
            <Link to={RECORD_PATH[task.recordType](task.recordId)} className="truncate text-brand-text hover:underline">
              {task.recordLabel}
            </Link>
          )}
          {task.assignee && task.assignee.id !== user?.userId && <span>→ {task.assignee.name}</span>}
        </div>
        {task.description && <p className="mt-1 text-xs text-muted-foreground">{task.description}</p>}
      </div>
      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button type="button" aria-label="Edit task" onClick={() => setEditing(true)} className="rounded p-1 text-subtle-foreground hover:bg-muted hover:text-foreground">
          <Icon name="edit" size={13} />
        </button>
        <button
          type="button"
          aria-label="Delete task"
          onClick={async () => {
            if (await confirm({ title: 'Delete this task?', confirmLabel: 'Delete', tone: 'danger' })) remove.mutate();
          }}
          className="rounded p-1 text-subtle-foreground hover:bg-muted hover:text-foreground"
        >
          <Icon name="trash" size={13} />
        </button>
      </div>
    </li>
  );
}

/** Tasks attached to one record, with quick add. Shows the next follow-up. */
export default function RecordTasks({ recordType, recordId }: { recordType: RecordType; recordId: string }) {
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: queryKeys.tasks({ recordType, recordId }),
    queryFn: () => workflowApi.getTasks({ recordType, recordId }),
  });
  const open = tasks.filter((t) => t.status === 'OPEN');
  const done = tasks.filter((t) => t.status === 'DONE');
  const nextFollowUp = open.filter((t) => t.dueAt).sort((a, b) => a.dueAt!.localeCompare(b.dueAt!))[0];

  return (
    <section className="rounded-lg border border-border bg-card shadow-xs">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            Tasks
            {open.length > 0 && (
              <span className="rounded-full bg-muted px-1.5 text-2xs font-medium text-muted-foreground ring-1 ring-inset ring-border">{open.length}</span>
            )}
          </h3>
          {nextFollowUp && (
            <p className="mt-0.5 text-2xs text-subtle-foreground">Next follow-up: {dueLabel(nextFollowUp.dueAt)?.text}</p>
          )}
        </div>
        {!adding && (
          <Button size="sm" variant="ghost" icon="plus" onClick={() => setAdding(true)}>
            Add
          </Button>
        )}
      </header>
      {adding && (
        <div className="border-b border-border p-4">
          <TaskForm recordType={recordType} recordId={recordId} onDone={() => setAdding(false)} />
        </div>
      )}
      {isLoading ? (
        <p className="px-4 py-5 text-center text-xs text-muted-foreground">Loading…</p>
      ) : open.length === 0 && !adding ? (
        <p className="px-4 py-5 text-center text-xs text-muted-foreground">No open tasks.</p>
      ) : (
        <ul className="divide-y divide-border">
          {open.map((t) => (
            <TaskItem key={t.id} task={t} showRecord={false} />
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <div className="border-t border-border">
          <button type="button" onClick={() => setShowDone((v) => !v)} className="w-full px-4 py-2 text-left text-2xs font-medium text-muted-foreground hover:text-foreground">
            {showDone ? 'Hide' : 'Show'} {done.length} completed
          </button>
          {showDone && (
            <ul className="divide-y divide-border">
              {done.map((t) => (
                <TaskItem key={t.id} task={t} showRecord={false} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
