import { invoke } from '@tauri-apps/api/core';

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
    await invoke('grant_permission', {
      agentId: request.agent_id,
      actionType: request.action_type,
      permanent,
    });
    onResolved();
  };

  const handleDeny = async () => {
    await invoke('deny_permission', {
      agentId: request.agent_id,
      actionType: request.action_type,
    });
    onResolved();
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
