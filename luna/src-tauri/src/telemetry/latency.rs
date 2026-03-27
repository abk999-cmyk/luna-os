use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use serde::Serialize;

/// Tracks latency measurements for named operations and computes percentiles.
pub struct LatencyTracker {
    measurements: RwLock<HashMap<String, Vec<LatencyMeasurement>>>,
    targets: HashMap<String, Duration>,
}

pub struct LatencyMeasurement {
    pub duration: Duration,
    pub timestamp: Instant,
}

#[derive(Debug, Clone, Serialize)]
pub struct LatencyReport {
    pub operation: String,
    pub target_ms: f64,
    pub p50_ms: f64,
    pub p95_ms: f64,
    pub p99_ms: f64,
    pub avg_ms: f64,
    pub sample_count: usize,
    pub within_target: bool,
}

/// RAII timer that records a latency measurement when dropped.
pub struct TimerGuard {
    operation: String,
    start: Instant,
    tracker: Arc<LatencyTracker>,
}

impl Drop for TimerGuard {
    fn drop(&mut self) {
        let duration = self.start.elapsed();
        self.tracker.record(&self.operation, duration);
    }
}

impl LatencyTracker {
    /// Create a new tracker with default target latencies for critical paths.
    pub fn new() -> Self {
        let mut targets = HashMap::new();
        targets.insert("action_dispatch".to_string(), Duration::from_micros(5000));
        targets.insert("ui_render".to_string(), Duration::from_micros(16670));
        targets.insert("workspace_switch".to_string(), Duration::from_millis(50));
        targets.insert("memory_read".to_string(), Duration::from_millis(10));
        targets.insert("db_query".to_string(), Duration::from_millis(20));

        Self {
            measurements: RwLock::new(HashMap::new()),
            targets,
        }
    }

    /// Record a latency measurement for the given operation.
    pub fn record(&self, operation: &str, duration: Duration) {
        let mut measurements = self.measurements.write().unwrap();
        measurements
            .entry(operation.to_string())
            .or_default()
            .push(LatencyMeasurement {
                duration,
                timestamp: Instant::now(),
            });
    }

    /// Start an RAII timer that records on drop. Requires an `Arc<LatencyTracker>`.
    pub fn start_timer(self: &Arc<Self>, operation: &str) -> TimerGuard {
        TimerGuard {
            operation: operation.to_string(),
            start: Instant::now(),
            tracker: Arc::clone(self),
        }
    }

    /// Compute a latency report (percentiles) for a single operation.
    pub fn report(&self, operation: &str) -> Option<LatencyReport> {
        let measurements = self.measurements.read().unwrap();
        let samples = measurements.get(operation)?;
        if samples.is_empty() {
            return None;
        }
        Some(self.compute_report(operation, samples))
    }

    /// Compute latency reports for all tracked operations.
    pub fn report_all(&self) -> Vec<LatencyReport> {
        let measurements = self.measurements.read().unwrap();
        measurements
            .iter()
            .filter(|(_, samples)| !samples.is_empty())
            .map(|(op, samples)| self.compute_report(op, samples))
            .collect()
    }

    /// Check whether the p95 latency for an operation is within its target.
    pub fn is_within_target(&self, operation: &str) -> bool {
        let report = match self.report(operation) {
            Some(r) => r,
            None => return true, // no data = assume fine
        };
        report.within_target
    }

    /// Remove measurements older than `max_age`.
    pub fn prune_old(&self, max_age: Duration) {
        let cutoff = Instant::now() - max_age;
        let mut measurements = self.measurements.write().unwrap();
        for samples in measurements.values_mut() {
            samples.retain(|m| m.timestamp > cutoff);
        }
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    fn compute_report(&self, operation: &str, samples: &[LatencyMeasurement]) -> LatencyReport {
        let mut durations: Vec<f64> = samples.iter().map(|m| m.duration.as_secs_f64() * 1000.0).collect();
        durations.sort_by(|a, b| a.partial_cmp(b).unwrap());

        let count = durations.len();
        let sum: f64 = durations.iter().sum();
        let avg = sum / count as f64;
        let p50 = percentile(&durations, 50.0);
        let p95 = percentile(&durations, 95.0);
        let p99 = percentile(&durations, 99.0);

        let target = self
            .targets
            .get(operation)
            .copied()
            .unwrap_or(Duration::from_millis(100));
        let target_ms = target.as_secs_f64() * 1000.0;

        LatencyReport {
            operation: operation.to_string(),
            target_ms,
            p50_ms: p50,
            p95_ms: p95,
            p99_ms: p99,
            avg_ms: avg,
            sample_count: count,
            within_target: p95 <= target_ms,
        }
    }
}

impl Default for LatencyTracker {
    fn default() -> Self {
        Self::new()
    }
}

/// Compute the p-th percentile (nearest-rank) from a sorted slice.
fn percentile(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let rank = (p / 100.0 * sorted.len() as f64).ceil() as usize;
    let idx = rank.saturating_sub(1).min(sorted.len() - 1);
    sorted[idx]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn test_record_and_report() {
        let tracker = LatencyTracker::new();
        for ms in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] {
            tracker.record("action_dispatch", Duration::from_millis(ms));
        }
        let report = tracker.report("action_dispatch").unwrap();
        assert_eq!(report.sample_count, 10);
        assert!(report.avg_ms > 0.0);
        assert!(report.p50_ms > 0.0);
    }

    #[test]
    fn test_percentile_calculation() {
        let tracker = LatencyTracker::new();
        // 100 samples from 1ms to 100ms
        for ms in 1..=100 {
            tracker.record("test_op", Duration::from_millis(ms));
        }
        let report = tracker.report("test_op").unwrap();
        // p50 should be around 50ms
        assert!(report.p50_ms >= 49.0 && report.p50_ms <= 51.0, "p50={}", report.p50_ms);
        // p95 should be around 95ms
        assert!(report.p95_ms >= 94.0 && report.p95_ms <= 96.0, "p95={}", report.p95_ms);
        // p99 should be around 99ms
        assert!(report.p99_ms >= 98.0 && report.p99_ms <= 100.0, "p99={}", report.p99_ms);
    }

    #[test]
    fn test_timer_guard() {
        let tracker = Arc::new(LatencyTracker::new());
        {
            let _guard = tracker.start_timer("test_timer");
            thread::sleep(Duration::from_millis(5));
        } // guard dropped here, records measurement
        let report = tracker.report("test_timer").unwrap();
        assert_eq!(report.sample_count, 1);
        assert!(report.p50_ms >= 4.0, "duration should be >= 4ms, got {}", report.p50_ms);
    }

    #[test]
    fn test_within_target() {
        let tracker = LatencyTracker::new();
        // All measurements well under the 5ms target for action_dispatch
        for _ in 0..20 {
            tracker.record("action_dispatch", Duration::from_micros(500));
        }
        assert!(tracker.is_within_target("action_dispatch"));

        // All measurements over the target
        for _ in 0..20 {
            tracker.record("db_query", Duration::from_millis(100));
        }
        assert!(!tracker.is_within_target("db_query"));
    }

    #[test]
    fn test_prune_old() {
        let tracker = LatencyTracker::new();
        tracker.record("old_op", Duration::from_millis(1));
        // We can't easily make timestamps old, but we can verify prune doesn't panic
        // and that a 0-duration max_age removes everything.
        tracker.prune_old(Duration::ZERO);
        assert!(tracker.report("old_op").is_none());
    }
}
