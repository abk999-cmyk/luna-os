use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub type WindowId = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowState {
    pub id: WindowId,
    pub title: String,
    pub bounds: Bounds,
    pub z_order: u32,
    pub visibility: Visibility,
    pub focused: bool,
    pub content_type: WindowContentType,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Bounds {
    pub fn default_centered(width: f64, height: f64) -> Self {
        Self {
            x: 100.0,
            y: 100.0,
            width,
            height,
        }
    }

    pub fn clamp(&mut self) {
        self.width = self.width.max(320.0).min(3840.0);
        self.height = self.height.max(240.0).min(2160.0);
        self.x = self.x.max(0.0);
        self.y = self.y.max(0.0);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Visibility {
    Visible,
    Minimized,
    Hidden,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum WindowContentType {
    Response,
    Editor,
    Panel,
    Canvas,
    Empty,
}

impl WindowState {
    pub fn new(title: String, bounds: Option<Bounds>, z_order: u32) -> Self {
        let id = Uuid::new_v4().to_string();
        let mut bounds = bounds.unwrap_or_else(|| Bounds::default_centered(600.0, 400.0));
        bounds.clamp();

        Self {
            id,
            title,
            bounds,
            z_order,
            visibility: Visibility::Visible,
            focused: true,
            content_type: WindowContentType::Empty,
            created_at: Utc::now(),
        }
    }
}
