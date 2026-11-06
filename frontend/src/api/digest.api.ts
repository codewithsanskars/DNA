import api from './axios';
import { ApiResponse } from '../types';

export type DigestScope = 'mine' | 'team';
export type DigestTone = 'danger' | 'warning' | 'info' | 'success' | 'neutral';

export interface DigestItem {
  id: string;
  title: string;
  detail: string;
  link: string;
  at?: string;
}

export interface DigestSection {
  key: string;
  title: string;
  tone: DigestTone;
  items: DigestItem[];
}

export interface Digest {
  date: string;
  scope: DigestScope;
  generatedAt: string;
  greeting: string;
  headline: string;
  focus: { ref: string; title: string; why: string; link: string }[];
  focusSource: 'ai' | 'rules';
  sections: DigestSection[];
  counts: Record<string, number>;
}

export const digestApi = {
  get: async (scope: DigestScope, refresh = false): Promise<Digest> => {
    const res = await api.get<ApiResponse<Digest>>('/digest', { params: { scope, refresh: refresh ? '1' : undefined }, timeout: 120000 });
    return res.data.data!;
  },
};
