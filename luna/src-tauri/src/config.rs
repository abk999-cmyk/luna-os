use std::env;
use std::path::PathBuf;
use tracing::info;

use crate::error::LunaError;

#[derive(Debug, Clone)]
pub struct LunaConfig {
    pub anthropic_api_key: Option<String>,
    pub openai_api_key: Option<String>,
    pub db_path: String,
    pub log_dir: String,
}

impl LunaConfig {
    pub fn load() -> Result<Self, LunaError> {
        let home = dirs_home();
        let luna_dir = home.join(".luna");

        let config = Self {
            anthropic_api_key: env::var("ANTHROPIC_API_KEY").ok(),
            openai_api_key: env::var("OPENAI_API_KEY").ok(),
            db_path: luna_dir
                .join("data")
                .join("luna.db")
                .to_string_lossy()
                .to_string(),
            log_dir: luna_dir.join("logs").to_string_lossy().to_string(),
        };

        info!(
            has_anthropic_key = config.anthropic_api_key.is_some(),
            has_openai_key = config.openai_api_key.is_some(),
            db_path = %config.db_path,
            "Configuration loaded"
        );

        Ok(config)
    }

    pub fn has_any_api_key(&self) -> bool {
        self.anthropic_api_key.is_some() || self.openai_api_key.is_some()
    }
}

fn dirs_home() -> PathBuf {
    env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}
