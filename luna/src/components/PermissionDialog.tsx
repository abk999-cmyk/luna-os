import { invoke } from '@tauri-apps/api/core';
import { approvePendingAction, denyPendingAction } from '../ipc/actions';

interface PermissionRequest {
  action_id: string;
  agent_id: string;
  agent_type?: string;
  action_type: string;
  payload_preview?: string;
}

interface PermissionDialogProps {
  request: PermissionRequest;
  onResolved: () => void;
}

export function PermissionDialog({ request, onResolved }: PermissionDialogProps) {
  const handleAllow = async (permanent: boolean) => {
    try {
      if (permanent) {
        // Grant permanent permission for this action type
        await invoke('grant_permission', {
          agentId: request.agent_id,
          actionType: request.action_type,
          permanent: true,
        });
      }
      // Always approve the specific pending action (re-dispatches it)
      await approvePendingAction(request.action_id);
      // Only dequeue on success
      onResolved();
    } catch (err) {
      console.error('Failed to approve pending action:', err);
      // Still dequeue on error to avoid permanently stuck dialog
      onResolved();
    }
  };

  const handleDeny = async () => {
    try {
      await denyPendingAction(request.action_id);
      onResolved();
    } catch (err) {
      console.error('Failed to deny pending action:', err);
      // Still dequeue to avoid stuck dialog
      onResolved();
    }
  };

  return (
    <div className="permission-overlay">
      <div className="permission-dialog">
        <div className="permission-header">
          <span className="permission-icon">🔐</span>
          <span className="permission-title">Permission Request</span>
        </div>

        <div className="permission-body">
          <div className="permission-intent">
            <div className="permission-intent__icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-amber-500, #d4a574)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </div>
            <div className="permission-intent__text">
              {getIntentDescription(request.action_type, request.agent_id)}
            </div>
          </div>

          <p className="permission-description">
            Agent <strong>{request.agent_id}</strong> wants to perform:
          </p>
          <code className="permission-action">{request.action_type}</code>

          {request.payload_preview && (
            <div className="permission-preview">
              <span className="permission-preview-label">Payload:</span>
              <pre className="permission-preview-content">{request.payload_preview}</pre>
            </div>
          )}
        </div>

        <div className="permission-actions">
          <button
            className="permission-btn permission-btn-deny"
            onClick={handleDeny}
          >
            Deny
          </button>
          <button
            className="permission-btn permission-btn-allow"
            onClick={() => handleAllow(false)}
          >
            Allow Once
          </button>
          <button
            className="permission-btn permission-btn-always"
            onClick={() => handleAllow(true)}
          >
            Always Allow
          </button>
        </div>
      </div>
    </div>
  );
}

function getIntentDescription(actionType: string, agentId: string): string {
  const prefix = actionType.split('.')[0];
  const action = actionType.split('.').slice(1).join('.');

  const intents: Record<string, string> = {
    'fs.write': `The agent wants to save a file to disk`,
    'fs.read': `The agent wants to read a file from your system`,
    'fs.delete': `The agent wants to delete a file from your system`,
    'fs.list': `The agent wants to list directory contents`,
    'window.create': `The agent wants to open a new window`,
    'window.close': `The agent wants to close a window`,
    'window.resize': `The agent wants to resize a window`,
    'agent.spawn': `The agent wants to create a sub-agent to help with a task`,
    'agent.message': `The agent wants to send a message to another agent`,
    'plan.create': `The agent wants to create a new task plan`,
    'plan.update': `The agent wants to modify an existing plan`,
    'memory.store': `The agent wants to save information to memory`,
    'memory.delete': `The agent wants to remove information from memory`,
    'app.launch': `The agent wants to launch an application`,
    'system.exec': `The agent wants to execute a system command`,
  };

  if (intents[actionType]) return intents[actionType];
  if (intents[`${prefix}.${action}`]) return intents[`${prefix}.${action}`];

  switch (prefix) {
    case 'fs': return `The agent wants to perform a file system operation (${action})`;
    case 'window': return `The agent wants to modify a window (${action})`;
    case 'agent': return `The agent wants to interact with another agent (${action})`;
    case 'memory': return `The agent wants to access the memory system (${action})`;
    case 'system': return `The agent wants to perform a system operation (${action})`;
    default: return `Agent "${agentId}" is requesting permission for: ${actionType}`;
  }
}
