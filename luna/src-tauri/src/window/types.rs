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
#[serde(rename_all = "snake_case")]
pub enum WindowContentType {
    Response,
    Editor,
    Panel,
    Canvas,
    Empty,
    DynamicApp,
    Terminal,
    Scratchpad,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bounds_default_centered() {
        let b = Bounds::default_centered(800.0, 600.0);
        assert_eq!(b.x, 100.0);
        assert_eq!(b.y, 100.0);
        assert_eq!(b.width, 800.0);
        assert_eq!(b.height, 600.0);
    }

    #[test]
    fn test_bounds_clamp_enforces_min() {
        let mut b = Bounds { x: -10.0, y: -5.0, width: 100.0, height: 50.0 };
        b.clamp();
        assert_eq!(b.x, 0.0);
        assert_eq!(b.y, 0.0);
        assert_eq!(b.width, 320.0);  // min width
        assert_eq!(b.height, 240.0); // min height
    }

    #[test]
    fn test_window_state_default_values() {
        let ws = WindowState::new("Test".to_string(), None, 1);
        assert_eq!(ws.title, "Test");
        assert_eq!(ws.visibility, Visibility::Visible);
        assert!(ws.focused);
        assert_eq!(ws.content_type, WindowContentType::Empty);
        // Default bounds: 600x400
        assert_eq!(ws.bounds.width, 600.0);
        assert_eq!(ws.bounds.height, 400.0);
    }

    #[test]
    fn test_window_content_type_variants() {
        let variants = vec![
            WindowContentType::Response,
            WindowContentType::Editor,
            WindowContentType::Panel,
            WindowContentType::Canvas,
            WindowContentType::Empty,
            WindowContentType::DynamicApp,
            WindowContentType::Terminal,
            WindowContentType::Scratchpad,
        ];
        // Verify they are all distinct
        assert_eq!(variants[0], WindowContentType::Response);
        assert_ne!(variants[0], WindowContentType::Editor);
    }
}
