import { In, LessThan } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import {
  Candidate,
  Job,
  Organization,
  OrganizationMembership,
  RecordNote,
  SavedSearch,
  Task,
} from '../entities';
import { NoteKind, RecordType, TaskPriority, TaskRecurrence, TaskStatus } from '../types';

const notes = () => AppDataSource.getRepository(RecordNote);
const tasks = () => AppDataSource.getRepository(Task);
const savedSearches = () => AppDataSource.getRepository(SavedSearch);
const memberships = () => AppDataSource.getRepository(OrganizationMembership);

const userRef = (u?: { id: string; name: string; email: string } | null) =>
  u ? { id: u.id, name: u.name, email: u.email } : null;

function noteToDto(n: RecordNote) {
  return {
    id: n.id,
    recordType: n.recordType,
    recordId: n.recordId,
    kind: n.kind,
    body: n.body,
    occurredAt: n.occurredAt,
    author: userRef(n.author) ?? { id: null, name: n.authorEmail, email: n.authorEmail },
    mentions: n.mentions,
    createdAt: n.createdAt,
  };
}

function taskToDto(t: Task) {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? undefined,
    dueAt: t.dueAt ?? undefined,
    priority: t.priority,
    status: t.status,
    recurrence: t.recurrence,
    assignee: userRef(t.assignee),
    createdBy: userRef(t.createdBy),
    recordType: t.recordType ?? undefined,
    recordId: t.recordId ?? undefined,
    completedAt: t.completedAt ?? undefined,
    createdAt: t.createdAt,
  };
}

export type NoteDto = ReturnType<typeof noteToDto>;
export type TaskDto = ReturnType<typeof taskToDto>;

export const workflowRepository = {
  // ---- Staff users ----------------------------------------------------------

  /** Every active SWFS (ADMIN) user — owners, assignees and @mention targets. */
  findStaff: async () => {
    const rows = await memberships().find({ where: { role: 'ADMIN', isActive: true }, relations: ['user'] });
    const byId = new Map(rows.filter((m) => m.user?.isActive).map((m) => [m.user.id, m.user]));
    return [...byId.values()]
      .map((u) => ({ id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl ?? undefined }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  isStaff: async (userId: string) =>
    (await memberships().count({ where: { user: { id: userId }, role: 'ADMIN', isActive: true } })) > 0,

  // ---- Record labels (for task/note context) --------------------------------

  /** Display labels for a mixed set of record references, keyed `type:id`. */
  recordLabels: async (refs: { recordType?: RecordType | null; recordId?: string | null }[]) => {
    const ids = (type: RecordType) => [
      ...new Set(refs.filter((r) => r.recordType === type && r.recordId).map((r) => r.recordId!)),
    ];
    const labels = new Map<string, string>();
    const candIds = ids('candidate');
    const jobIds = ids('job');
    const orgIds = ids('organization');
    if (candIds.length) {
      const rows = await AppDataSource.getRepository(Candidate).find({
        where: { id: In(candIds) },
        select: ['id', 'firstName', 'lastName'],
      });
      rows.forEach((c) => labels.set(`candidate:${c.id}`, `${c.firstName} ${c.lastName}`));
    }
    if (jobIds.length) {
      const rows = await AppDataSource.getRepository(Job).find({ where: { id: In(jobIds) }, relations: ['organization'] });
      rows.forEach((j) => labels.set(`job:${j.id}`, j.organization ? `${j.title} · ${j.organization.name}` : j.title));
    }
    if (orgIds.length) {
      const rows = await AppDataSource.getRepository(Organization).find({ where: { id: In(orgIds) }, select: ['id', 'name'] });
      rows.forEach((o) => labels.set(`organization:${o.id}`, o.name));
    }
    return labels;
  },

  recordExists: async (recordType: RecordType, recordId: string) => {
    const entity = recordType === 'candidate' ? Candidate : recordType === 'job' ? Job : Organization;
    return (await AppDataSource.getRepository(entity).count({ where: { id: recordId } })) > 0;
  },

  // ---- Notes / activity log -------------------------------------------------

  listNotes: async (recordType: RecordType, recordId: string) => {
    const rows = await notes().find({
      where: { recordType, recordId },
      relations: ['author'],
      order: { occurredAt: 'DESC', createdAt: 'DESC' },
    });
    return rows.map(noteToDto);
  },

  /** Notes that @mention a user, newest first. */
  listMentions: async (userId: string, limit = 30) => {
    const rows = await notes()
      .createQueryBuilder('n')
      .leftJoinAndSelect('n.author', 'author')
      .where(':userId = ANY(n.mentions)', { userId })
      .orderBy('n.createdAt', 'DESC')
      .take(limit)
      .getMany();
    return rows.map(noteToDto);
  },

  createNote: async (data: {
    recordType: RecordType;
    recordId: string;
    kind: NoteKind;
    body: string;
    occurredAt?: Date;
    authorId: string;
    authorEmail: string;
    mentions: string[];
  }) => {
    const saved = await notes().save(
      notes().create({
        recordType: data.recordType,
        recordId: data.recordId,
        kind: data.kind,
        body: data.body,
        occurredAt: data.occurredAt ?? new Date(),
        author: { id: data.authorId } as any,
        authorEmail: data.authorEmail,
        mentions: data.mentions,
      })
    );
    const full = await notes().findOne({ where: { id: saved.id }, relations: ['author'] });
    return noteToDto(full!);
  },

  findNote: async (id: string) => notes().findOne({ where: { id }, relations: ['author'] }),

  deleteNote: async (id: string) => {
    await notes().delete(id);
  },

  // ---- Tasks ----------------------------------------------------------------

  listTasks: async (filter: {
    assigneeId?: string;
    createdById?: string;
    status?: TaskStatus;
    recordType?: RecordType;
    recordId?: string;
  }) => {
    const where: Record<string, unknown> = {};
    if (filter.assigneeId) where.assignee = { id: filter.assigneeId };
    if (filter.createdById) where.createdBy = { id: filter.createdById };
    if (filter.status) where.status = filter.status;
    if (filter.recordType) where.recordType = filter.recordType;
    if (filter.recordId) where.recordId = filter.recordId;
    const rows = await tasks().find({
      where,
      relations: ['assignee', 'createdBy'],
      order: { status: 'ASC', dueAt: { direction: 'ASC', nulls: 'LAST' }, createdAt: 'DESC' },
      take: 500,
    });
    return rows.map(taskToDto);
  },

  taskCounts: async (assigneeId: string, now: Date, endOfToday: Date) => {
    const base = { assignee: { id: assigneeId }, status: 'OPEN' as TaskStatus };
    const [overdue, dueToday, open] = await Promise.all([
      tasks().count({ where: { ...base, dueAt: LessThan(now) } }),
      tasks()
        .createQueryBuilder('t')
        .where('t."assigneeId" = :assigneeId AND t.status = :status', { assigneeId, status: 'OPEN' })
        .andWhere('t."dueAt" >= :now AND t."dueAt" <= :end', { now, end: endOfToday })
        .getCount(),
      tasks().count({ where: base }),
    ]);
    return { overdue, dueToday, open };
  },

  findTask: async (id: string) => {
    const t = await tasks().findOne({ where: { id }, relations: ['assignee', 'createdBy'] });
    return t ? taskToDto(t) : null;
  },

  createTask: async (data: {
    title: string;
    description?: string | null;
    dueAt?: Date | null;
    priority: TaskPriority;
    recurrence: TaskRecurrence;
    assigneeId: string | null;
    createdById: string;
    recordType?: RecordType | null;
    recordId?: string | null;
  }) => {
    const saved = await tasks().save(
      tasks().create({
        title: data.title,
        description: data.description ?? null,
        dueAt: data.dueAt ?? null,
        priority: data.priority,
        recurrence: data.recurrence,
        assignee: data.assigneeId ? ({ id: data.assigneeId } as any) : null,
        createdBy: { id: data.createdById } as any,
        recordType: data.recordType ?? null,
        recordId: data.recordId ?? null,
      })
    );
    return workflowRepository.findTask(saved.id);
  },

  updateTask: async (id: string, data: Record<string, unknown>) => {
    const { assigneeId, ...rest } = data;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
    if (assigneeId !== undefined) patch.assignee = assigneeId ? { id: assigneeId } : null;
    if (Object.keys(patch).length) await tasks().update(id, patch);
    return workflowRepository.findTask(id);
  },

  deleteTask: async (id: string) => {
    await tasks().delete(id);
  },

  /** Notes and tasks hang off records by (type, id) with no FK — remove them with the record. */
  deleteForRecord: async (recordType: RecordType, recordId: string) => {
    await Promise.all([notes().delete({ recordType, recordId }), tasks().delete({ recordType, recordId })]);
  },

  // ---- Saved searches -------------------------------------------------------

  listSavedSearches: async (userId: string) => {
    const rows = await savedSearches().find({ where: { user: { id: userId } }, order: { createdAt: 'DESC' } });
    return rows.map((s) => ({ id: s.id, name: s.name, params: s.params, createdAt: s.createdAt }));
  },

  createSavedSearch: async (userId: string, name: string, params: Record<string, string>) => {
    const s = await savedSearches().save(savedSearches().create({ user: { id: userId } as any, name, params }));
    return { id: s.id, name: s.name, params: s.params, createdAt: s.createdAt };
  },

  deleteSavedSearch: async (userId: string, id: string) => {
    const res = await savedSearches().delete({ id, user: { id: userId } });
    return (res.affected ?? 0) > 0;
  },
};
