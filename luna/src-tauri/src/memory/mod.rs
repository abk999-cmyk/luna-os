pub mod working;
pub mod episodic;
pub mod semantic;

pub use working::WorkingMemory;
pub use episodic::EpisodicMemory;
pub use semantic::{SemanticMemory, AgentStateStore};

use std::sync::{Arc, Mutex};
use crate::persistence::db::Database;

/// Aggregates all memory layers into a single accessible struct.
pub struct MemorySystem {
    pub working: Arc<WorkingMemory>,
    pub episodic: Arc<EpisodicMemory>,
    pub semantic: Arc<SemanticMemory>,
    pub agent_state: Arc<AgentStateStore>,
}

impl MemorySystem {
    pub fn new(db: Arc<Mutex<Option<Database>>>) -> Self {
        Self {
            working: Arc::new(WorkingMemory::new()),
            episodic: Arc::new(EpisodicMemory::new(db.clone())),
            semantic: Arc::new(SemanticMemory::new(db.clone())),
            agent_state: Arc::new(AgentStateStore::new(db)),
        }
    }
}
