use tokio::sync::mpsc;
use super::types::Action;
use crate::error::LunaError;

pub struct ActionQueue {
    sender: mpsc::UnboundedSender<Action>,
}

impl ActionQueue {
    pub fn new() -> (Self, mpsc::UnboundedReceiver<Action>) {
        let (sender, receiver) = mpsc::unbounded_channel();
        (Self { sender }, receiver)
    }

    pub fn enqueue(&self, action: Action) -> Result<(), LunaError> {
        self.sender
            .send(action)
            .map_err(|e| LunaError::Dispatch(format!("Failed to enqueue action: {}", e)))
    }
}
