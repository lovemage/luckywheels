import { api } from './client.js';

export interface TimePlan {
  points: number;
  hours: number;
  /** 後端依方案產生的說明文字，例：「3 點積分兌換 24 小時（1 天）」 */
  label: string;
}

export interface AssistantPass {
  active: boolean;
  expiresAt: string | null;
  remainingSeconds: number;
}

export interface AssistantMe {
  points: number;
  pass: AssistantPass;
  plans: TimePlan[];
  serverTime: string;
}

export const fetchAssistantMe = () => api<AssistantMe>('/api/assistant/me');
