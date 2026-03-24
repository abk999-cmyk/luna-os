use std::collections::HashMap;
use tokio::sync::RwLock;

/// Manages pub/sub subscriptions for dot-namespaced topics.
/// Subscribers receive updates matching their topic pattern.
/// Example topics: "window.position", "app.data", "agent.status"
pub struct TopicManager {
    /// topic → list of subscriber IDs
    subscribers: RwLock<HashMap<String, Vec<String>>>,
}

impl TopicManager {
    pub fn new() -> Self {
        Self {
            subscribers: RwLock::new(HashMap::new()),
        }
    }

    /// Subscribe to a topic. Supports exact match and wildcard (e.g. "window.*").
    pub async fn subscribe(&self, subscriber_id: &str, topic: &str) {
        let mut subs = self.subscribers.write().await;
        subs.entry(topic.to_string())
            .or_default()
            .push(subscriber_id.to_string());
    }

    /// Unsubscribe from a topic.
    pub async fn unsubscribe(&self, subscriber_id: &str, topic: &str) {
        let mut subs = self.subscribers.write().await;
        if let Some(list) = subs.get_mut(topic) {
            list.retain(|id| id != subscriber_id);
            if list.is_empty() {
                subs.remove(topic);
            }
        }
    }

    /// Get all subscriber IDs that match a given topic.
    /// Matches exact topics and wildcard patterns (e.g. "window.*" matches "window.position").
    pub async fn get_subscribers(&self, topic: &str) -> Vec<String> {
        let subs = self.subscribers.read().await;
        let mut result = Vec::new();

        for (pattern, subscribers) in subs.iter() {
            if topic_matches(pattern, topic) {
                result.extend(subscribers.iter().cloned());
            }
        }

        result
    }
}

/// Check if a subscription pattern matches a topic.
/// Supports exact match and trailing wildcard ("window.*" matches "window.position").
fn topic_matches(pattern: &str, topic: &str) -> bool {
    if pattern == topic {
        return true;
    }
    if let Some(prefix) = pattern.strip_suffix(".*") {
        return topic.starts_with(prefix) && topic[prefix.len()..].starts_with('.');
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_exact_match() {
        assert!(topic_matches("window.position", "window.position"));
        assert!(!topic_matches("window.position", "window.size"));
    }

    #[test]
    fn test_wildcard_match() {
        assert!(topic_matches("window.*", "window.position"));
        assert!(topic_matches("window.*", "window.size"));
        assert!(!topic_matches("window.*", "app.data"));
    }
}
