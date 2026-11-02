import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, RecordType } from '../types';
import { workflowService } from '../services/workflow.service';
import { auditLogService } from '../services/auditLog.service';
import { NOTE_KINDS, RECORD_TYPES, TASK_PRIORITIES, TASK_RECURRENCES, TASK_STATUSES } from '../entities/enums';
import {
  badRequest,
  optionalDate,
  optionalEnum,
  optionalString,
  optionalStringArray,
  optionalUuid,
  requiredString,
} from '../utils/http';

function recordRef(source: Record<string, unknown>, required: boolean) {
  const recordType = optionalEnum(source.recordType, RECORD_TYPES, 'Record type');
  const recordId = optionalUuid(source.recordId, 'Record id');
  if (required && (!recordType || !recordId)) throw badRequest('recordType and recordId are required');
  return { recordType: recordType ?? undefined, recordId: recordId ?? undefined };
}

const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v));

/** SWFS-staff work management: notes & activity log, tasks, saved searches. */
export const workflowController = {
  listStaff: async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      res.json({ success: true, data: await workflowService.listStaff() });
    } catch (err) {
      next(err);
    }
  },

  // ---- Notes ----------------------------------------------------------------

  listNotes: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { recordType, recordId } = recordRef(req.query as Record<string, unknown>, true);
      res.json({ success: true, data: await workflowService.listNotes(recordType as RecordType, recordId!) });
    } catch (err) {
      next(err);
    }
  },

  listMentions: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      res.json({ success: true, data: await workflowService.listMentions(req.user!.userId) });
    } catch (err) {
      next(err);
    }
  },

  addNote: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { recordType, recordId } = recordRef(req.body, true);
      const note = await workflowService.addNote(req.user!, {
        recordType: recordType as RecordType,
        recordId: recordId!,
        kind: optionalEnum(req.body.kind, NOTE_KINDS, 'Kind') ?? 'NOTE',
        body: requiredString(req.body.body, 'Note', 10_000),
        occurredAt: toDate(optionalDate(req.body.occurredAt, 'Date')) ?? undefined,
        mentions: (optionalStringArray(req.body.mentions, 'Mentions', 20) ?? []).map((id) => optionalUuid(id, 'Mention')!),
      });
      await auditLogService.log(req.user!, note.kind === 'NOTE' ? 'ADD_NOTE' : `LOG_${note.kind}`, recordType!, recordId!, {
        noteId: note.id,
        mentions: note.mentions,
        body: note.body.slice(0, 300),
      });
      res.status(201).json({ success: true, data: note });
    } catch (err) {
      next(err);
    }
  },

  deleteNote: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const note = await workflowService.deleteNote(req.user!, req.params.id);
      await auditLogService.log(req.user!, 'DELETE_NOTE', note.recordType, note.recordId, { noteId: note.id });
      res.json({ success: true, data: { id: req.params.id } });
    } catch (err) {
      next(err);
    }
  },

  // ---- Tasks ----------------------------------------------------------------

  listTasks: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const q = req.query as Record<string, unknown>;
      const { recordType, recordId } = recordRef(q, false);
      const data = await workflowService.listTasks(req.user!, {
        scope: optionalEnum(q.scope, ['mine', 'created', 'all'] as const, 'Scope') ?? undefined,
        status: optionalEnum(q.status, TASK_STATUSES, 'Status') ?? undefined,
        recordType: recordType as RecordType | undefined,
        recordId,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  taskSummary: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      res.json({ success: true, data: await workflowService.taskSummary(req.user!) });
    } catch (err) {
      next(err);
    }
  },

  createTask: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { recordType, recordId } = recordRef(req.body, false);
      const task = await workflowService.createTask(req.user!, {
        title: requiredString(req.body.title, 'Title', 300),
        description: optionalString(req.body.description, 'Description', 5000) || null,
        dueAt: toDate(optionalDate(req.body.dueAt, 'Due date')),
        priority: optionalEnum(req.body.priority, TASK_PRIORITIES, 'Priority'),
        recurrence: optionalEnum(req.body.recurrence, TASK_RECURRENCES, 'Recurrence'),
        assigneeId: optionalUuid(req.body.assigneeId, 'Assignee'),
        recordType,
        recordId,
      });
      await auditLogService.log(req.user!, 'CREATE_TASK', task.recordType ?? 'task', task.recordId ?? task.id, {
        taskId: task.id,
        title: task.title,
        dueAt: task.dueAt,
        assigneeId: task.assignee?.id,
      });
      res.status(201).json({ success: true, data: task });
    } catch (err) {
      next(err);
    }
  },

  updateTask: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const title = optionalString(req.body.title, 'Title', 300);
      if (title !== undefined && !title) throw badRequest('Title cannot be empty');
      const previous = await workflowService.getTask(req.params.id);
      const task = await workflowService.updateTask(req.params.id, {
        title,
        description: req.body.description === undefined ? undefined : optionalString(req.body.description, 'Description', 5000) || null,
        dueAt: toDate(optionalDate(req.body.dueAt, 'Due date')),
        priority: optionalEnum(req.body.priority, TASK_PRIORITIES, 'Priority'),
        recurrence: optionalEnum(req.body.recurrence, TASK_RECURRENCES, 'Recurrence'),
        assigneeId: optionalUuid(req.body.assigneeId, 'Assignee'),
      });
      // Reassignment notifies the new assignee.
      if (task.assignee && task.assignee.id !== previous?.assignee?.id) {
        await auditLogService.log(req.user!, 'ASSIGN_TASK', task.recordType ?? 'task', task.recordId ?? task.id, {
          taskId: task.id,
          title: task.title,
          dueAt: task.dueAt,
          assigneeId: task.assignee.id,
        });
      }
      res.json({ success: true, data: task });
    } catch (err) {
      next(err);
    }
  },

  completeTask: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await workflowService.completeTask(req.user!, req.params.id);
      await auditLogService.log(req.user!, 'COMPLETE_TASK', result.task.recordType ?? 'task', result.task.recordId ?? result.task.id, {
        taskId: result.task.id,
        title: result.task.title,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  reopenTask: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      res.json({ success: true, data: await workflowService.reopenTask(req.params.id) });
    } catch (err) {
      next(err);
    }
  },

  deleteTask: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await workflowService.deleteTask(req.params.id);
      res.json({ success: true, data: { id: req.params.id } });
    } catch (err) {
      next(err);
    }
  },

  // ---- Saved searches -------------------------------------------------------

  listSavedSearches: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      res.json({ success: true, data: await workflowService.listSavedSearches(req.user!.userId) });
    } catch (err) {
      next(err);
    }
  },

  createSavedSearch: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const name = requiredString(req.body.name, 'Name', 100);
      const raw = req.body.params;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw badRequest('params must be an object');
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (v !== undefined && v !== null && v !== '') params[k.slice(0, 50)] = String(v).slice(0, 500);
      }
      res.status(201).json({ success: true, data: await workflowService.createSavedSearch(req.user!.userId, name, params) });
    } catch (err) {
      next(err);
    }
  },

  deleteSavedSearch: async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await workflowService.deleteSavedSearch(req.user!.userId, req.params.id);
      res.json({ success: true, data: { id: req.params.id } });
    } catch (err) {
      next(err);
    }
  },
};
