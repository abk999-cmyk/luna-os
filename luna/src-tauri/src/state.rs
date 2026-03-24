use std::sync::{Arc, Mutex};
use tokio::sync::RwLock;

use crate::action::dispatcher::ActionDispatcher;
use crate::agent::conductor::ConductorAgent;
use crate::persistence::db::Database;
use crate::window::manager::WindowManager;

pub struct AppState {
    pub dispatcher: Arc<ActionDispatcher>,
    pub window_manager: Arc<RwLock<WindowManager>>,
    pub conductor: Arc<RwLock<Option<ConductorAgent>>>,
    pub db: Arc<Mutex<Option<Database>>>,
    pub session_id: Arc<RwLock<Option<String>>>,
}

impl AppState {
    pub fn new(
        dispatcher: Arc<ActionDispatcher>,
        window_manager: Arc<RwLock<WindowManager>>,
        conductor: Arc<RwLock<Option<ConductorAgent>>>,
        db: Arc<Mutex<Option<Database>>>,
    ) -> Self {
        Self {
            dispatcher,
            window_manager,
            conductor,
            db,
            session_id: Arc::new(RwLock::new(None)),
        }
    }
}
