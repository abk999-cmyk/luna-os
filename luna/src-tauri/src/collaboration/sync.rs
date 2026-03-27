use std::collections::HashMap;

use crate::error::LunaError;

#[derive(Debug, Clone)]
pub struct SyncOperation {
    pub id: String,
    pub resource_id: String,
    pub user_id: String,
    pub operation_type: OperationType,
    pub payload: serde_json::Value,
    pub version: u64,
    pub timestamp: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub enum OperationType {
    Insert,
    Update,
    Delete,
}

#[derive(Debug, Clone)]
pub enum ConflictResolution {
    LastWriterWins,
    Merge(serde_json::Value),
    Conflict(SyncOperation, SyncOperation),
}

pub struct SyncEngine {
    version_clock: tokio::sync::RwLock<HashMap<String, u64>>,
    last_ops: tokio::sync::RwLock<HashMap<String, SyncOperation>>,
}

impl SyncEngine {
    pub fn new() -> Self {
        Self {
            version_clock: tokio::sync::RwLock::new(HashMap::new()),
            last_ops: tokio::sync::RwLock::new(HashMap::new()),
        }
    }

    pub async fn apply_operation(
        &self,
        op: SyncOperation,
    ) -> Result<ConflictResolution, LunaError> {
        let mut versions = self.version_clock.write().await;
        let current_version = versions.get(&op.resource_id).copied().unwrap_or(0);

        if op.version <= current_version && current_version > 0 {
            // Potential conflict: the operation is based on a stale version
            let last_ops = self.last_ops.read().await;
            if let Some(existing_op) = last_ops.get(&op.resource_id) {
                let resolution = self.resolve_conflict(existing_op.clone(), op.clone());
                match &resolution {
                    ConflictResolution::LastWriterWins => {
                        // The newer timestamp wins
                        if op.timestamp >= existing_op.timestamp {
                            let new_version = current_version + 1;
                            versions.insert(op.resource_id.clone(), new_version);
                            drop(last_ops);
                            self.last_ops.write().await.insert(op.resource_id.clone(), op);
                        }
                    }
                    ConflictResolution::Merge(merged_payload) => {
                        // Apply the merged result
                        let new_version = current_version + 1;
                        versions.insert(op.resource_id.clone(), new_version);
                        let mut merged_op = op.clone();
                        merged_op.payload = merged_payload.clone();
                        merged_op.version = new_version;
                        drop(last_ops);
                        self.last_ops.write().await.insert(op.resource_id.clone(), merged_op);
                    }
                    ConflictResolution::Conflict(_, _) => {
                        // Do not apply — caller must resolve manually
                    }
                }
                return Ok(resolution);
            }
        }

        // No conflict: apply directly
        let new_version = current_version + 1;
        versions.insert(op.resource_id.clone(), new_version);
        drop(versions);
        self.last_ops.write().await.insert(op.resource_id.clone(), op);

        Ok(ConflictResolution::LastWriterWins)
    }

    pub async fn get_version(&self, resource_id: &str) -> u64 {
        self.version_clock
            .read()
            .await
            .get(resource_id)
            .copied()
            .unwrap_or(0)
    }

    pub fn resolve_conflict(
        &self,
        op1: SyncOperation,
        op2: SyncOperation,
    ) -> ConflictResolution {
        // If one is a delete and the other is not, they are structurally incompatible
        if op1.operation_type != op2.operation_type {
            let is_incompatible = matches!(
                (&op1.operation_type, &op2.operation_type),
                (OperationType::Delete, OperationType::Insert)
                    | (OperationType::Insert, OperationType::Delete)
                    | (OperationType::Delete, OperationType::Update)
                    | (OperationType::Update, OperationType::Delete)
            );
            if is_incompatible {
                return ConflictResolution::Conflict(op1, op2);
            }
        }

        // Check if the operations touch different fields (mergeable)
        let op1_fields: std::collections::HashSet<String> = op1
            .payload
            .as_object()
            .map(|obj| obj.keys().cloned().collect())
            .unwrap_or_default();
        let op2_fields: std::collections::HashSet<String> = op2
            .payload
            .as_object()
            .map(|obj| obj.keys().cloned().collect())
            .unwrap_or_default();

        // If both payloads are objects and touch different fields, merge them
        if op1.payload.is_object()
            && op2.payload.is_object()
            && op1_fields.is_disjoint(&op2_fields)
            && !op1_fields.is_empty()
            && !op2_fields.is_empty()
        {
            // Merge: combine fields from both operations
            let mut merged = op1
                .payload
                .as_object()
                .cloned()
                .unwrap_or_default();
            if let Some(obj2) = op2.payload.as_object() {
                for (k, v) in obj2 {
                    merged.insert(k.clone(), v.clone());
                }
            }
            return ConflictResolution::Merge(serde_json::Value::Object(merged));
        }

        // Same fields or non-object payloads: last writer wins
        ConflictResolution::LastWriterWins
    }
}

impl Default for SyncEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
fn make_op(resource_id: &str, user_id: &str, version: u64, timestamp: i64) -> SyncOperation {
    use uuid::Uuid;
    SyncOperation {
        id: Uuid::new_v4().to_string(),
        resource_id: resource_id.to_string(),
        user_id: user_id.to_string(),
        operation_type: OperationType::Update,
        payload: serde_json::json!({"data": "test"}),
        version,
        timestamp,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_apply_operation_increments_version() {
        let engine = SyncEngine::new();
        let op = make_op("res1", "user1", 0, 1000);
        let result = engine.apply_operation(op).await.unwrap();
        assert!(matches!(result, ConflictResolution::LastWriterWins));
        assert_eq!(engine.get_version("res1").await, 1);
    }

    #[tokio::test]
    async fn test_sequential_operations() {
        let engine = SyncEngine::new();
        let op1 = make_op("res1", "user1", 0, 1000);
        engine.apply_operation(op1).await.unwrap();

        let op2 = make_op("res1", "user1", 1, 2000);
        engine.apply_operation(op2).await.unwrap();
        assert_eq!(engine.get_version("res1").await, 2);
    }

    #[tokio::test]
    async fn test_conflict_lww() {
        let engine = SyncEngine::new();
        let op1 = make_op("res1", "user1", 0, 1000);
        engine.apply_operation(op1).await.unwrap();

        // Stale version triggers conflict resolution
        let op2 = make_op("res1", "user2", 0, 2000);
        let result = engine.apply_operation(op2).await.unwrap();
        assert!(matches!(result, ConflictResolution::LastWriterWins));
    }

    #[tokio::test]
    async fn test_get_version_unknown_resource() {
        let engine = SyncEngine::new();
        assert_eq!(engine.get_version("nonexistent").await, 0);
    }

    #[tokio::test]
    async fn test_conflict_merge_disjoint_fields() {
        let engine = SyncEngine::new();
        let op1 = SyncOperation {
            id: uuid::Uuid::new_v4().to_string(),
            resource_id: "res1".to_string(),
            user_id: "user1".to_string(),
            operation_type: OperationType::Update,
            payload: serde_json::json!({"title": "Hello"}),
            version: 0,
            timestamp: 1000,
        };
        engine.apply_operation(op1).await.unwrap();

        // Second op touches different field with stale version
        let op2 = SyncOperation {
            id: uuid::Uuid::new_v4().to_string(),
            resource_id: "res1".to_string(),
            user_id: "user2".to_string(),
            operation_type: OperationType::Update,
            payload: serde_json::json!({"color": "blue"}),
            version: 0,
            timestamp: 2000,
        };
        let result = engine.apply_operation(op2).await.unwrap();
        match result {
            ConflictResolution::Merge(merged) => {
                assert_eq!(merged.get("title").unwrap(), "Hello");
                assert_eq!(merged.get("color").unwrap(), "blue");
            }
            other => panic!("Expected Merge, got {:?}", other),
        }
    }

    #[tokio::test]
    async fn test_conflict_incompatible_ops() {
        let engine = SyncEngine::new();
        let op1 = SyncOperation {
            id: uuid::Uuid::new_v4().to_string(),
            resource_id: "res1".to_string(),
            user_id: "user1".to_string(),
            operation_type: OperationType::Update,
            payload: serde_json::json!({"data": "test"}),
            version: 0,
            timestamp: 1000,
        };
        engine.apply_operation(op1).await.unwrap();

        // Delete conflicts with the existing update
        let op2 = SyncOperation {
            id: uuid::Uuid::new_v4().to_string(),
            resource_id: "res1".to_string(),
            user_id: "user2".to_string(),
            operation_type: OperationType::Delete,
            payload: serde_json::json!({}),
            version: 0,
            timestamp: 2000,
        };
        let result = engine.apply_operation(op2).await.unwrap();
        assert!(matches!(result, ConflictResolution::Conflict(_, _)));
    }

    #[tokio::test]
    async fn test_conflict_same_fields_lww() {
        let engine = SyncEngine::new();
        let op1 = SyncOperation {
            id: uuid::Uuid::new_v4().to_string(),
            resource_id: "res1".to_string(),
            user_id: "user1".to_string(),
            operation_type: OperationType::Update,
            payload: serde_json::json!({"title": "First"}),
            version: 0,
            timestamp: 1000,
        };
        engine.apply_operation(op1).await.unwrap();

        // Same field, same op type — should LWW
        let op2 = SyncOperation {
            id: uuid::Uuid::new_v4().to_string(),
            resource_id: "res1".to_string(),
            user_id: "user2".to_string(),
            operation_type: OperationType::Update,
            payload: serde_json::json!({"title": "Second"}),
            version: 0,
            timestamp: 2000,
        };
        let result = engine.apply_operation(op2).await.unwrap();
        assert!(matches!(result, ConflictResolution::LastWriterWins));
    }
}
