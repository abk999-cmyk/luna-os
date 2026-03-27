use tauri::State;

use crate::error::LunaError;
use crate::state::AppState;
use super::metrics::MetricsSnapshot;
use super::latency::LatencyReport;

/// Return a snapshot of all system metrics (counters + gauges).
#[tauri::command]
pub async fn get_metrics(
    state: State<'_, AppState>,
) -> Result<MetricsSnapshot, LunaError> {
    Ok(state.metrics.snapshot())
}

/// Return latency reports for all tracked operations.
#[tauri::command]
pub async fn get_latency_report(
    state: State<'_, AppState>,
) -> Result<Vec<LatencyReport>, LunaError> {
    Ok(state.latency.report_all())
}
