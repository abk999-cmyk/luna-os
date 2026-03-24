use std::collections::HashMap;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

/// A pending update to be batched and emitted.
#[derive(Debug, Clone)]
pub struct PendingUpdate {
    pub topic: String,
    pub payload: serde_json::Value,
    pub timestamp: Instant,
}

/// Batches state updates and flushes them at intervals to reduce IPC chatter.
/// Deduplicates by topic (latest wins) and flushes every 16ms or when 10 updates accumulate.
pub struct UpdateBatcher {
    pending: Mutex<HashMap<String, PendingUpdate>>,
    max_batch_size: usize,
    flush_interval: Duration,
}

impl UpdateBatcher {
    pub fn new() -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
            max_batch_size: 10,
            flush_interval: Duration::from_millis(16),
        }
    }

    /// Queue an update. If the topic already has a pending update, replace it (latest wins).
    pub async fn queue(&self, topic: String, payload: serde_json::Value) {
        let mut pending = self.pending.lock().await;
        pending.insert(
            topic.clone(),
            PendingUpdate {
                topic,
                payload,
                timestamp: Instant::now(),
            },
        );
    }

    /// Flush all pending updates. Returns the batch and clears the queue.
    pub async fn flush(&self) -> Vec<PendingUpdate> {
        let mut pending = self.pending.lock().await;
        let batch: Vec<PendingUpdate> = pending.drain().map(|(_, v)| v).collect();
        batch
    }

    /// Check if we should flush (based on count or time).
    pub async fn should_flush(&self) -> bool {
        let pending = self.pending.lock().await;
        if pending.is_empty() {
            return false;
        }
        if pending.len() >= self.max_batch_size {
            return true;
        }
        // Check if oldest update has been waiting too long
        if let Some(oldest) = pending.values().min_by_key(|u| u.timestamp) {
            return oldest.timestamp.elapsed() >= self.flush_interval;
        }
        false
    }

    /// Spawn the background flush loop. Calls the provided closure with each batch.
    pub fn spawn_flush_loop<F>(self: &std::sync::Arc<Self>, mut on_flush: F)
    where
        F: FnMut(Vec<PendingUpdate>) + Send + 'static,
    {
        let batcher = self.clone();
        tauri::async_runtime::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_millis(16));
            loop {
                interval.tick().await;
                if batcher.should_flush().await {
                    let batch = batcher.flush().await;
                    if !batch.is_empty() {
                        on_flush(batch);
                    }
                }
            }
        });
    }
}
