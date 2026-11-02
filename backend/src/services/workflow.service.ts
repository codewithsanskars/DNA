import { workflowRepository } from '../repositories/workflow.repository';
import { candidateRepository } from '../repositories/candidate.repository';
import { JwtPayload, NoteKind, RecordType, TaskPriority, TaskRecurrence, TaskStatus } from '../types';
import { badRequest, forbidden, notFound } from '../utils/http';

/** Interaction kinds that count as "contacting" a candidate (RC-75). */
const CONTACT_KINDS: NoteKind[] = ['CALL', 'EMAIL', 'MEETING'];

function nextOccurrence(from: Date, recurrence: TaskRecurrence): Date | null {
  const d = new Date(from);
  if (recurrence === 'DAILY') d.setDate(d.getDate() + 1);
  else if (recurrence === 'WEEKLY') d.setDate(d.getDate() + 7);
  else if (recurrence === 'MONTHLY') d.setMonth(d.getMonth() + 1);
  else return null;
  return d;
}

async function withLabels<T extends { recordType?: RecordType | null; recordId?: string | null }>(items: T[]) {
  const labels = await workflowRepository.recordLabels(items);
  return items.map((i) => ({
    ...i,
    recordLabel: i.recordType && i.recordId ? labels.get(`${i.recordType}:${i.recordId}`) ?? null : null,
  }));
}

async function assertStaff(ids: string[], label: string) {
  for (const id of ids) {
    if (!(await workflowRepository.isStaff(id))) throw badRequest(`${label} must be an SWFS team member`);
  }
}

export const workflowService = {
  listStaff: () => workflowRepository.findStaff(),

  // ---- Notes / activity -----------------------------------------------------

  listNotes: async (recordType: RecordType, recordId: string) => workflowRepository.listNotes(recordType, recordId),

  listMentions: async (userId: string) => withLabels(await workflowRepository.listMentions(userId)),

  addNote: async (
    user: JwtPayload,
    input: { recordType: RecordType; recordId: string; kind: NoteKind; body: string; occurredAt?: Date; mentions: string[] }
  ) => {
    if (!(await workflowRepository.recordExists(input.recordType, input.recordId))) throw notFound('Record not found');
    const mentions = [...new Set(input.mentions)].filter((id) => id !== user.userId);
    await assertStaff(mentions, 'Mentioned user');
    const note = await workflowRepository.createNote({
      ...input,
      mentions,
      authorId: user.userId,
      authorEmail: user.email,
    });
    if (input.recordType === 'candidate' && CONTACT_KINDS.includes(input.kind)) {
      await candidateRepository.touchLastContacted(input.recordId, input.occurredAt ?? new Date());
    }
    return note;
  },

  deleteNote: async (user: JwtPayload, noteId: string) => {
    const note = await workflowRepository.findNote(noteId);
    if (!note) throw notFound('Note not found');
    if (note.author?.id !== user.userId) throw forbidden('You can only delete your own notes');
    await workflowRepository.deleteNote(noteId);
    return note;
  },

  // ---- Tasks ----------------------------------------------------------------

  listTasks: async (
    user: JwtPayload,
    filter: { scope?: 'mine' | 'created' | 'all'; status?: TaskStatus; recordType?: RecordType; recordId?: string }
  ) => {
    const scope = filter.recordId ? 'all' : filter.scope ?? 'mine';
    const list = await workflowRepository.listTasks({
      assigneeId: scope === 'mine' ? user.userId : undefined,
      createdById: scope === 'created' ? user.userId : undefined,
      status: filter.status,
      recordType: filter.recordType,
      recordId: filter.recordId,
    });
    return withLabels(list);
  },

  taskSummary: async (user: JwtPayload) => {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const counts = await workflowRepository.taskCounts(user.userId, now, end);
    const mentions = await workflowRepository.listMentions(user.userId, 10);
    return { ...counts, recentMentions: (await withLabels(mentions)).slice(0, 10) };
  },

  createTask: async (
    user: JwtPayload,
    input: {
      title: string;
      description?: string | null;
      dueAt?: Date | null;
      priority?: TaskPriority | null;
      recurrence?: TaskRecurrence | null;
      assigneeId?: string | null;
      recordType?: RecordType | null;
      recordId?: string | null;
    }
  ) => {
    // Unassigned defaults to the creator — "add a task" means "for me".
    const assigneeId = input.assigneeId === undefined ? user.userId : input.assigneeId;
    if (assigneeId) await assertStaff([assigneeId], 'Assignee');
    if (input.recordType && input.recordId && !(await workflowRepository.recordExists(input.recordType, input.recordId))) {
      throw notFound('Linked record not found');
    }
    const task = await workflowRepository.createTask({
      title: input.title,
      description: input.description,
      dueAt: input.dueAt,
      priority: input.priority ?? 'MEDIUM',
      recurrence: input.recurrence ?? 'NONE',
      assigneeId,
      createdById: user.userId,
      recordType: input.recordType && input.recordId ? input.recordType : null,
      recordId: input.recordType && input.recordId ? input.recordId : null,
    });
    return (await withLabels([task!]))[0];
  },

  getTask: (taskId: string) => workflowRepository.findTask(taskId),

  updateTask: async (
    taskId: string,
    patch: {
      title?: string;
      description?: string | null;
      dueAt?: Date | null;
      priority?: TaskPriority | null;
      recurrence?: TaskRecurrence | null;
      assigneeId?: string | null;
    }
  ) => {
    const task = await workflowRepository.findTask(taskId);
    if (!task) throw notFound('Task not found');
    if (patch.assigneeId) await assertStaff([patch.assigneeId], 'Assignee');
    const updated = await workflowRepository.updateTask(taskId, {
      ...patch,
      priority: patch.priority ?? undefined,
      recurrence: patch.recurrence ?? undefined,
    });
    return (await withLabels([updated!]))[0];
  },

  /** Completing a recurring task schedules its next occurrence (RC-73). */
  completeTask: async (user: JwtPayload, taskId: string) => {
    const task = await workflowRepository.findTask(taskId);
    if (!task) throw notFound('Task not found');
    if (task.status === 'DONE') return { task: (await withLabels([task]))[0], next: null };
    const done = await workflowRepository.updateTask(taskId, { status: 'DONE', completedAt: new Date() });
    let next = null;
    const nextDue = task.recurrence !== 'NONE' ? nextOccurrence(task.dueAt ? new Date(task.dueAt) : new Date(), task.recurrence) : null;
    if (nextDue) {
      next = await workflowRepository.createTask({
        title: task.title,
        description: task.description,
        dueAt: nextDue,
        priority: task.priority,
        recurrence: task.recurrence,
        assigneeId: task.assignee?.id ?? null,
        createdById: user.userId,
        recordType: task.recordType,
        recordId: task.recordId,
      });
    }
    const [d, n] = await withLabels([done!, ...(next ? [next] : [])]);
    return { task: d, next: n ?? null };
  },

  reopenTask: async (taskId: string) => {
    const task = await workflowRepository.findTask(taskId);
    if (!task) throw notFound('Task not found');
    const updated = await workflowRepository.updateTask(taskId, { status: 'OPEN', completedAt: null });
    return (await withLabels([updated!]))[0];
  },

  deleteTask: async (taskId: string) => {
    const task = await workflowRepository.findTask(taskId);
    if (!task) throw notFound('Task not found');
    await workflowRepository.deleteTask(taskId);
    return task;
  },

  // ---- Saved searches -------------------------------------------------------

  listSavedSearches: (userId: string) => workflowRepository.listSavedSearches(userId),

  createSavedSearch: (userId: string, name: string, params: Record<string, string>) =>
    workflowRepository.createSavedSearch(userId, name, params),

  deleteSavedSearch: async (userId: string, id: string) => {
    if (!(await workflowRepository.deleteSavedSearch(userId, id))) throw notFound('Saved search not found');
  },
};
