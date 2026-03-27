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
