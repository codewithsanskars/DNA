import api from './axios';
import {
  ApiResponse,
  NoteKind,
  RecordNote,
  RecordType,
  SavedSearch,
  StaffUser,
  Task,
  TaskPriority,
  TaskRecurrence,
  TaskStatus,
  TaskSummary,
} from '../types';

export interface TaskInput {
  title?: string;
  description?: string | null;
  dueAt?: string | null;
  priority?: TaskPriority;
  recurrence?: TaskRecurrence;
  assigneeId?: string | null;
  recordType?: RecordType;
  recordId?: string;
}

/** SWFS-staff work management — every endpoint here is ADMIN-only. */
export const workflowApi = {
  getStaff: async (): Promise<StaffUser[]> => {
    const res = await api.get<ApiResponse<StaffUser[]>>('/workflow/staff');
    return res.data.data!;
  },

  // ---- Notes / activity log ----------------------------------------------

  getNotes: async (recordType: RecordType, recordId: string): Promise<RecordNote[]> => {
    const res = await api.get<ApiResponse<RecordNote[]>>('/workflow/notes', { params: { recordType, recordId } });
    return res.data.data!;
  },

  getMentions: async (): Promise<RecordNote[]> => {
    const res = await api.get<ApiResponse<RecordNote[]>>('/workflow/notes/mentions');
    return res.data.data!;
  },

  addNote: async (input: {
    recordType: RecordType;
    recordId: string;
    kind: NoteKind;
    body: string;
    occurredAt?: string;
    mentions?: string[];
  }): Promise<RecordNote> => {
    const res = await api.post<ApiResponse<RecordNote>>('/workflow/notes', input);
    return res.data.data!;
  },

  deleteNote: async (id: string): Promise<void> => {
    await api.delete(`/workflow/notes/${id}`);
  },

  // ---- Tasks -------------------------------------------------------------

  getTasks: async (params: {
    scope?: 'mine' | 'created' | 'all';
    status?: TaskStatus;
    recordType?: RecordType;
    recordId?: string;
  }): Promise<Task[]> => {
    const res = await api.get<ApiResponse<Task[]>>('/workflow/tasks', { params });
    return res.data.data!;
  },

  getTaskSummary: async (): Promise<TaskSummary> => {
    const res = await api.get<ApiResponse<TaskSummary>>('/workflow/tasks/summary');
    return res.data.data!;
  },

  createTask: async (input: TaskInput & { title: string }): Promise<Task> => {
    const res = await api.post<ApiResponse<Task>>('/workflow/tasks', input);
    return res.data.data!;
  },

  updateTask: async (id: string, input: TaskInput): Promise<Task> => {
    const res = await api.patch<ApiResponse<Task>>(`/workflow/tasks/${id}`, input);
    return res.data.data!;
  },

  completeTask: async (id: string): Promise<{ task: Task; next: Task | null }> => {
    const res = await api.post<ApiResponse<{ task: Task; next: Task | null }>>(`/workflow/tasks/${id}/complete`);
    return res.data.data!;
  },

  reopenTask: async (id: string): Promise<Task> => {
    const res = await api.post<ApiResponse<Task>>(`/workflow/tasks/${id}/reopen`);
    return res.data.data!;
  },

  deleteTask: async (id: string): Promise<void> => {
    await api.delete(`/workflow/tasks/${id}`);
  },

  // ---- Saved searches ----------------------------------------------------

  getSavedSearches: async (): Promise<SavedSearch[]> => {
    const res = await api.get<ApiResponse<SavedSearch[]>>('/workflow/saved-searches');
    return res.data.data!;
  },

  createSavedSearch: async (name: string, params: Record<string, string>): Promise<SavedSearch> => {
    const res = await api.post<ApiResponse<SavedSearch>>('/workflow/saved-searches', { name, params });
    return res.data.data!;
  },

  deleteSavedSearch: async (id: string): Promise<void> => {
    await api.delete(`/workflow/saved-searches/${id}`);
  },
};
