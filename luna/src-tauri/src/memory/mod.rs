pub mod working;
pub mod episodic;
pub mod semantic;
pub mod procedural;
pub mod context_budget;

pub use working::WorkingMemory;
pub use episodic::EpisodicMemory;
pub use semantic::{SemanticMemory, AgentStateStore, SemanticNode, SemanticEdge, NodeType, RelationshipType};
pub use procedural::ProceduralMemory;
pub use context_budget::ContextBudgetManager;

use std::sync::Arc;
use tokio::sync::Mutex;
use crate::persistence::db::Database;

/// Aggregates all memory layers into a single accessible struct.
pub struct MemorySystem {
    pub working: Arc<WorkingMemory>,
    pub episodic: Arc<EpisodicMemory>,
    pub semantic: Arc<SemanticMemory>,
    pub agent_state: Arc<AgentStateStore>,
    pub procedural: Arc<ProceduralMemory>,
    pub context_budget: Arc<ContextBudgetManager>,
}

impl MemorySystem {
    pub fn new(db: Arc<Mutex<Database>>) -> Self {
        Self {
            working: Arc::new(WorkingMemory::new()),
            episodic: Arc::new(EpisodicMemory::new(db.clone())),
            semantic: Arc::new(SemanticMemory::new(db.clone())),
            agent_state: Arc::new(AgentStateStore::new(db.clone())),
            procedural: Arc::new(ProceduralMemory::new(db)),
            context_budget: Arc::new(ContextBudgetManager::new()),
        }
    }
}
