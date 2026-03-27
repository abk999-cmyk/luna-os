use std::collections::VecDeque;
use super::types::{Action, ActionSource};

pub struct ActionHistory {
    buffer: VecDeque<Action>,
    capacity: usize,
}

impl ActionHistory {
    pub fn new(capacity: usize) -> Self {
        Self {
            buffer: VecDeque::with_capacity(capacity),
            capacity,
        }
    }

    pub fn push(&mut self, action: Action) {
        if self.buffer.len() >= self.capacity {
            self.buffer.pop_front();
        }
        self.buffer.push_back(action);
    }

    pub fn query_by_type(&self, action_type: &str) -> Vec<&Action> {
        self.buffer
            .iter()
            .filter(|a| a.action_type == action_type)
            .collect()
    }

    pub fn query_by_source(&self, source: &ActionSource) -> Vec<&Action> {
        self.buffer
            .iter()
            .filter(|a| a.source == *source)
            .collect()
    }

    pub fn recent(&self, n: usize) -> Vec<&Action> {
        self.buffer.iter().rev().take(n).collect()
    }

    pub fn len(&self) -> usize {
        self.buffer.len()
    }

    pub fn update_status(&mut self, action_id: &uuid::Uuid, status: super::types::ActionStatus) {
        for action in self.buffer.iter_mut() {
            if action.id == *action_id {
                action.status = status;
                break;
            }
        }
    }

    pub fn drain_all(&mut self) -> Vec<Action> {
        self.buffer.drain(..).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::action::types::ActionStatus;

    fn make_action(action_type: &str, source: ActionSource) -> Action {
        Action::new(action_type.to_string(), serde_json::Value::Null, source)
    }

    #[test]
    fn test_push_adds_to_history() {
        let mut history = ActionHistory::new(100);
        history.push(make_action("window.create", ActionSource::User));
        assert_eq!(history.len(), 1);
    }

    #[test]
    fn test_recent_returns_last_n_items() {
        let mut history = ActionHistory::new(100);
        history.push(make_action("action.a", ActionSource::User));
        history.push(make_action("action.b", ActionSource::User));
        history.push(make_action("action.c", ActionSource::User));
        let recent = history.recent(2);
        assert_eq!(recent.len(), 2);
        // recent() reverses, so most recent first
        assert_eq!(recent[0].action_type, "action.c");
        assert_eq!(recent[1].action_type, "action.b");
    }

    #[test]
    fn test_query_by_type_filters_correctly() {
        let mut history = ActionHistory::new(100);
        history.push(make_action("window.create", ActionSource::User));
        history.push(make_action("window.close", ActionSource::User));
        history.push(make_action("window.create", ActionSource::System));
        let results = history.query_by_type("window.create");
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_query_by_source_filters_correctly() {
        let mut history = ActionHistory::new(100);
        history.push(make_action("a", ActionSource::User));
        history.push(make_action("b", ActionSource::System));
        history.push(make_action("c", ActionSource::User));
        let results = history.query_by_source(&ActionSource::User);
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_capacity_limit_is_respected() {
        let mut history = ActionHistory::new(3);
        for i in 0..5 {
            history.push(make_action(&format!("action.{}", i), ActionSource::User));
        }
        assert_eq!(history.len(), 3);
        // Oldest items should have been evicted
        let all = history.recent(3);
        assert_eq!(all[0].action_type, "action.4");
        assert_eq!(all[1].action_type, "action.3");
        assert_eq!(all[2].action_type, "action.2");
    }

    #[test]
    fn test_update_status_changes_action_status() {
        let mut history = ActionHistory::new(100);
        let action = make_action("test.action", ActionSource::User);
        let action_id = action.id;
        history.push(action);
        history.update_status(&action_id, ActionStatus::Completed);
        let found = history.recent(1);
        assert_eq!(found[0].status, ActionStatus::Completed);
    }
}
