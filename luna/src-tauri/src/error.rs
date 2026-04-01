use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum LunaError {
    #[error("Action dispatch error: {0}")]
    Dispatch(String),

    #[error("Window error: {0}")]
    Window(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Agent error: {0}")]
    Agent(String),

    #[error("Serialization error: {0}")]
    Serialization(String),

    #[error("API error: {0}")]
    Api(String),

    #[error("Config error: {0}")]
    Config(String),

    #[error("Permission denied: {0}")]
    Permission(String),

    #[error("Pending approval: action {0} requires user approval")]
    PendingApproval(String),

    #[error("Migration error: {0}")]
    Migration(String),

    #[error("IO error: {0}")]
    Io(String),
}

impl From<serde_json::Error> for LunaError {
    fn from(err: serde_json::Error) -> Self {
        LunaError::Serialization(err.to_string())
    }
}

impl From<rusqlite::Error> for LunaError {
    fn from(err: rusqlite::Error) -> Self {
        LunaError::Database(err.to_string())
    }
}

impl From<reqwest::Error> for LunaError {
    fn from(err: reqwest::Error) -> Self {
        LunaError::Api(err.to_string())
    }
}

// Make LunaError compatible with Tauri's invoke system
impl Serialize for LunaError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
