use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use super::learning::{DetectedPattern, Observation};

/// Decision pattern — captures context-aware decisions the user makes repeatedly
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecisionPattern {
    pub id: String,
    pub decision_type: String,      // e.g. "file_format_choice", "tool_selection"
    pub context_tags: Vec<String>,
    pub chosen_option: String,
    pub frequency: u32,
    pub confidence: f64,
    pub last_seen: i64,
}

/// Spatial pattern — window layout arrangements the user creates
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpatialPattern {
    pub id: String,
    pub window_arrangement: Vec<WindowPosition>,
    pub context_tags: Vec<String>,
    pub frequency: u32,
    pub last_seen: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowPosition {
    pub content_type: String,
    pub relative_x: f64,  // 0.0-1.0 normalized
    pub relative_y: f64,
    pub relative_width: f64,
    pub relative_height: f64,
}

/// Stateless pattern detection algorithms.
pub struct PatternDetector;

impl PatternDetector {
    /// Find repeated subsequences in action sequences using N-gram analysis.
    ///
    /// Extracts all N-grams (from `min_length` up to 5) from each sequence,
    /// counts occurrences across all sequences, and returns those meeting
    /// `min_frequency`.
    pub fn find_repeated_sequences(
        actions: &[Vec<String>],
        min_length: usize,
        min_frequency: u32,
    ) -> Vec<DetectedPattern> {
        let max_n = 5;
        let total = actions.len() as u32;

        // ngram -> count
        let mut counts: HashMap<Vec<String>, u32> = HashMap::new();

        for seq in actions {
            // Deduplicate within a single sequence so one long sequence doesn't
            // inflate the count.
            let mut seen_in_seq: std::collections::HashSet<Vec<String>> =
                std::collections::HashSet::new();

            for n in min_length..=max_n {
                if seq.len() < n {
                    continue;
                }
                for window in seq.windows(n) {
                    let gram = window.to_vec();
                    if seen_in_seq.insert(gram.clone()) {
                        *counts.entry(gram).or_insert(0) += 1;
                    }
                }
            }
        }

        counts
            .into_iter()
            .filter(|(_, c)| *c >= min_frequency)
            .map(|(seq, freq)| {
                let confidence = Self::calculate_confidence(freq, total, 0.0);
                DetectedPattern {
                    sequence: seq,
                    frequency: freq,
                    confidence,
                    context_tags: Vec::new(),
                }
            })
            .collect()
    }

    /// Cluster observations by context tags.
    ///
    /// Two observations are in the same cluster if they share at least
    /// `min_overlap` tags. Returns groups of observation indices.
    pub fn cluster_by_context(
        observations: &[Observation],
        min_overlap: usize,
    ) -> Vec<Vec<usize>> {
        let n = observations.len();
        // Union-Find
        let mut parent: Vec<usize> = (0..n).collect();

        fn find(parent: &mut [usize], i: usize) -> usize {
            let mut root = i;
            while parent[root] != root {
                root = parent[root];
            }
            // Path compression
            let mut cur = i;
            while parent[cur] != root {
                let next = parent[cur];
                parent[cur] = root;
                cur = next;
            }
            root
        }

        for i in 0..n {
            for j in (i + 1)..n {
                let overlap = observations[i]
                    .context_tags
                    .iter()
                    .filter(|t| observations[j].context_tags.contains(t))
                    .count();
                if overlap >= min_overlap {
                    let ri = find(&mut parent, i);
                    let rj = find(&mut parent, j);
                    if ri != rj {
                        parent[ri] = rj;
                    }
                }
            }
        }

        // Group by root
        let mut groups: HashMap<usize, Vec<usize>> = HashMap::new();
        for i in 0..n {
            let root = find(&mut parent, i);
            groups.entry(root).or_default().push(i);
        }

        groups.into_values().filter(|g| g.len() > 1).collect()
    }

    /// Detect decision patterns from observations.
    ///
    /// A "decision" is identified when the same context tags co-occur with
    /// the same first action (the "chosen option") across multiple observations.
    pub fn detect_decision_patterns(observations: &[Observation]) -> Vec<DecisionPattern> {
        // Key: (sorted context_tags, first action) -> list of timestamps
        let mut decision_map: HashMap<(Vec<String>, String), Vec<i64>> = HashMap::new();

        for obs in observations {
            if obs.action_sequence.is_empty() || obs.context_tags.is_empty() {
                continue;
            }
            let chosen = obs.action_sequence[0].clone();
            let mut tags = obs.context_tags.clone();
            tags.sort();
            decision_map
                .entry((tags, chosen))
                .or_default()
                .push(obs.timestamp);
        }

        let total = observations.len() as u32;
        decision_map
            .into_iter()
            .filter(|(_, timestamps)| timestamps.len() >= 2)
            .map(|((tags, chosen), timestamps)| {
                let frequency = timestamps.len() as u32;
                let last_seen = timestamps.iter().copied().max().unwrap_or(0);
                let now = chrono::Utc::now().timestamp();
                let days_since = ((now - last_seen) as f64 / 86400.0).max(0.0);
                let confidence = Self::calculate_confidence(frequency, total, days_since);
                // Derive a decision_type from the tags
                let decision_type = if tags.len() >= 2 {
                    format!("{}_in_{}", chosen, tags[0])
                } else {
                    format!("{}_choice", chosen)
                };
                DecisionPattern {
                    id: uuid::Uuid::new_v4().to_string(),
                    decision_type,
                    context_tags: tags,
                    chosen_option: chosen,
                    frequency,
                    confidence,
                    last_seen,
                }
            })
            .collect()
    }

    /// Detect spatial patterns from window layout snapshots.
    ///
    /// Groups snapshots by structural similarity (same content types in similar
    /// positions) and returns patterns that appear at least twice.
    pub fn detect_spatial_patterns(window_snapshots: &[Vec<WindowPosition>]) -> Vec<SpatialPattern> {
        // Normalize each snapshot to a "signature": sorted content_type list
        // plus quantized positions (rounded to nearest 0.1).
        let mut sig_map: HashMap<String, (Vec<Vec<WindowPosition>>, Vec<usize>)> = HashMap::new();

        for (idx, snapshot) in window_snapshots.iter().enumerate() {
            let mut sig_parts: Vec<String> = snapshot
                .iter()
                .map(|wp| {
                    format!(
                        "{}@{:.1},{:.1},{:.1},{:.1}",
                        wp.content_type,
                        (wp.relative_x * 10.0).round() / 10.0,
                        (wp.relative_y * 10.0).round() / 10.0,
                        (wp.relative_width * 10.0).round() / 10.0,
                        (wp.relative_height * 10.0).round() / 10.0,
                    )
                })
                .collect();
            sig_parts.sort();
            let sig = sig_parts.join("|");
            let entry = sig_map.entry(sig).or_insert_with(|| (Vec::new(), Vec::new()));
            entry.0.push(snapshot.clone());
            entry.1.push(idx);
        }

        sig_map
            .into_iter()
            .filter(|(_, (snapshots, _))| snapshots.len() >= 2)
            .map(|(_, (snapshots, _indices))| {
                let frequency = snapshots.len() as u32;
                // Use the first snapshot as the representative arrangement
                let arrangement = snapshots[0].clone();
                // Collect content types as context tags
                let context_tags: Vec<String> = arrangement
                    .iter()
                    .map(|wp| wp.content_type.clone())
                    .collect();
                let now = chrono::Utc::now().timestamp();
                SpatialPattern {
                    id: uuid::Uuid::new_v4().to_string(),
                    window_arrangement: arrangement,
                    context_tags,
                    frequency,
                    last_seen: now,
                }
            })
            .collect()
    }

    /// Calculate confidence score for a pattern based on frequency, total
    /// observations, and recency.
    ///
    /// Formula: `(freq / total) * decay` where decay = `e^(-0.05 * days_since_last)`.
    pub fn calculate_confidence(
        frequency: u32,
        total_observations: u32,
        days_since_last: f64,
    ) -> f64 {
        if total_observations == 0 {
            return 0.0;
        }
        let ratio = frequency as f64 / total_observations as f64;
        let decay = (-0.05 * days_since_last).exp();
        (ratio * decay).clamp(0.0, 1.0)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::intelligence::learning::{Observation, ObservationOutcome};

    #[test]
    fn test_find_repeated_sequences_basic() {
        let actions = vec![
            vec!["open".into(), "edit".into(), "save".into()],
            vec!["open".into(), "edit".into(), "save".into()],
            vec!["open".into(), "edit".into(), "compile".into()],
        ];

        let patterns = PatternDetector::find_repeated_sequences(&actions, 2, 2);
        let has_open_edit = patterns.iter().any(|p| {
            p.sequence == vec!["open".to_string(), "edit".to_string()]
        });
        assert!(has_open_edit, "should detect 'open, edit' repeated");

        let has_edit_save = patterns.iter().any(|p| {
            p.sequence == vec!["edit".to_string(), "save".to_string()]
        });
        assert!(has_edit_save, "should detect 'edit, save' repeated");
    }

    #[test]
    fn test_find_repeated_sequences_respects_min_frequency() {
        let actions = vec![
            vec!["a".into(), "b".into(), "c".into()],
            vec!["x".into(), "y".into(), "z".into()],
        ];

        let patterns = PatternDetector::find_repeated_sequences(&actions, 2, 2);
        assert!(patterns.is_empty(), "no sequence appears twice");
    }

    #[test]
    fn test_cluster_by_context() {
        let obs = vec![
            Observation {
                id: "1".into(),
                action_sequence: vec![],
                context_tags: vec!["rust".into(), "backend".into()],
                timestamp: 0,
                outcome: ObservationOutcome::Success,
            },
            Observation {
                id: "2".into(),
                action_sequence: vec![],
                context_tags: vec!["rust".into(), "backend".into(), "api".into()],
                timestamp: 1,
                outcome: ObservationOutcome::Success,
            },
            Observation {
                id: "3".into(),
                action_sequence: vec![],
                context_tags: vec!["frontend".into(), "css".into()],
                timestamp: 2,
                outcome: ObservationOutcome::Success,
            },
        ];

        let clusters = PatternDetector::cluster_by_context(&obs, 2);
        assert_eq!(clusters.len(), 1, "obs 0 and 1 share 2 tags");
        assert!(clusters[0].contains(&0) && clusters[0].contains(&1));
    }

    #[test]
    fn test_calculate_confidence() {
        // High frequency, recent
        let c1 = PatternDetector::calculate_confidence(8, 10, 0.0);
        assert!((c1 - 0.8).abs() < 0.01);

        // Same frequency but old
        let c2 = PatternDetector::calculate_confidence(8, 10, 20.0);
        assert!(c2 < c1, "older patterns should have lower confidence");

        // Zero total
        let c3 = PatternDetector::calculate_confidence(5, 0, 0.0);
        assert!((c3).abs() < f64::EPSILON);
    }

    #[test]
    fn test_no_duplicate_counting_within_sequence() {
        // A single long sequence with a repeated sub-pattern should only count once.
        let actions = vec![
            vec!["a".into(), "b".into(), "a".into(), "b".into(), "a".into(), "b".into()],
        ];
        let patterns = PatternDetector::find_repeated_sequences(&actions, 2, 2);
        // "a","b" appears in multiple windows but should count only 1 per sequence
        assert!(
            patterns.is_empty(),
            "single sequence should not self-inflate counts"
        );
    }
}
