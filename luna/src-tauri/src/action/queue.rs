use tokio::sync::mpsc;
use super::types::Action;
use crate::error::LunaError;

pub struct ActionQueue {
    sender: mpsc::Sender<Action>,
}

impl ActionQueue {
    pub fn new() -> (Self, mpsc::Receiver<Action>) {
        let (sender, receiver) = mpsc::channel(1024);
        (Self { sender }, receiver)
    }

    pub fn enqueue(&self, action: Action) -> Result<(), LunaError> {
        self.sender
            .try_send(action)
            .map_err(|e| LunaError::Dispatch(format!("Failed to enqueue action: {}", e)))
    }
}
