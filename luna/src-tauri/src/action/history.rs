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
