export interface Action {
  id: string;
  action_type: string;
  payload: unknown;
  timestamp: string;
  source: ActionSource;
  priority: 'low' | 'normal' | 'high' | 'critical';
  retry_count: number;
  status: ActionStatus;
}

export type ActionSource =
  | { type: 'User' }
  | { type: 'Agent'; id: string }
  | { type: 'System' };

export type ActionStatus =
  | 'pending'
  | 'dispatched'
  | 'completed'
  | { failed: string };
