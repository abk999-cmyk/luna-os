use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::RwLock;
use std::time::Instant;

use serde::Serialize;

/// Collects counters and gauges for system-wide observability.
pub struct MetricsCollector {
    counters: RwLock<HashMap<String, AtomicU64>>,
    gauges: RwLock<HashMap<String, f64>>,
    start_time: Instant,
}

#[derive(Debug, Clone, Serialize)]
pub struct MetricsSnapshot {
    pub counters: HashMap<String, u64>,
    pub gauges: HashMap<String, f64>,
    pub uptime_secs: u64,
}

impl MetricsCollector {
    /// Create a new, empty metrics collector.
    pub fn new() -> Self {
        Self {
            counters: RwLock::new(HashMap::new()),
            gauges: RwLock::new(HashMap::new()),
            start_time: Instant::now(),
        }
    }

    /// Increment a named counter by 1.
    pub fn increment(&self, name: &str) {
        self.increment_by(name, 1);
    }

    /// Increment a named counter by `n`.
    pub fn increment_by(&self, name: &str, n: u64) {
        // Try read-lock first (fast path: counter already exists)
        {
            let counters = self.counters.read().unwrap_or_else(|e| e.into_inner());
            if let Some(counter) = counters.get(name) {
                counter.fetch_add(n, Ordering::Relaxed);
                return;
            }
        }
        // Slow path: insert new counter
        let mut counters = self.counters.write().unwrap_or_else(|e| e.into_inner());
        counters
            .entry(name.to_string())
            .or_insert_with(|| AtomicU64::new(0))
            .fetch_add(n, Ordering::Relaxed);
    }

    /// Set a gauge to an absolute value.
    pub fn set_gauge(&self, name: &str, value: f64) {
        let mut gauges = self.gauges.write().unwrap_or_else(|e| e.into_inner());
        gauges.insert(name.to_string(), value);
    }

    /// Read the current value of a counter (0 if it doesn't exist).
    pub fn get_counter(&self, name: &str) -> u64 {
        let counters = self.counters.read().unwrap_or_else(|e| e.into_inner());
        counters
            .get(name)
            .map(|c| c.load(Ordering::Relaxed))
            .unwrap_or(0)
    }

    /// Read the current value of a gauge.
    pub fn get_gauge(&self, name: &str) -> Option<f64> {
        let gauges = self.gauges.read().unwrap_or_else(|e| e.into_inner());
        gauges.get(name).copied()
    }

    /// Seconds since the collector was created.
    pub fn get_uptime_secs(&self) -> u64 {
        self.start_time.elapsed().as_secs()
    }

    /// Record that an action was dispatched (for throughput tracking).
    pub fn record_action_dispatched(&self) {
        self.increment("actions_dispatched_total");
    }

    /// Estimate actions per second based on total count and uptime.
    /// A proper sliding-window implementation would require tracking
    /// individual timestamps; for now we expose a simple average.
    pub fn get_actions_per_second(&self) -> f64 {
        let total = self.get_counter("actions_dispatched_total") as f64;
        let uptime = self.get_uptime_secs().max(1) as f64;
        total / uptime
    }

    /// Return a serializable snapshot of all metrics.
    pub fn snapshot(&self) -> MetricsSnapshot {
        // Update the action throughput gauge before snapshotting
        self.set_gauge("action_throughput_per_sec", self.get_actions_per_second());

        let counters = {
            let map = self.counters.read().unwrap_or_else(|e| e.into_inner());
            map.iter()
                .map(|(k, v)| (k.clone(), v.load(Ordering::Relaxed)))
                .collect()
        };
        let gauges = {
            let map = self.gauges.read().unwrap_or_else(|e| e.into_inner());
            map.clone()
        };
        MetricsSnapshot {
            counters,
            gauges,
            uptime_secs: self.get_uptime_secs(),
        }
    }
}

impl Default for MetricsCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_increment_and_read() {
        let mc = MetricsCollector::new();
        mc.increment("requests");
        mc.increment("requests");
        assert_eq!(mc.get_counter("requests"), 2);
    }

    #[test]
    fn test_increment_by() {
        let mc = MetricsCollector::new();
        mc.increment_by("bytes", 1024);
        mc.increment_by("bytes", 512);
        assert_eq!(mc.get_counter("bytes"), 1536);
    }

    #[test]
    fn test_gauge_set_and_read() {
        let mc = MetricsCollector::new();
        assert_eq!(mc.get_gauge("cpu"), None);
        mc.set_gauge("cpu", 42.5);
        assert_eq!(mc.get_gauge("cpu"), Some(42.5));
        mc.set_gauge("cpu", 10.0);
        assert_eq!(mc.get_gauge("cpu"), Some(10.0));
    }

    #[test]
    fn test_snapshot() {
        let mc = MetricsCollector::new();
        mc.increment("a");
        mc.increment_by("b", 5);
        mc.set_gauge("g", 3.14);
        let snap = mc.snapshot();
        assert_eq!(snap.counters.get("a"), Some(&1));
        assert_eq!(snap.counters.get("b"), Some(&5));
        assert_eq!(snap.gauges.get("g"), Some(&3.14));
    }
}
