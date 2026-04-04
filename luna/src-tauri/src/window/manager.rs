use std::collections::HashMap;
use crate::error::LunaError;
use super::types::{WindowId, WindowState, Bounds, Visibility};

pub struct WindowManager {
    windows: HashMap<WindowId, WindowState>,
    z_counter: u32,
}

impl WindowManager {
    pub fn new() -> Self {
        Self {
            windows: HashMap::new(),
            z_counter: 0,
        }
    }

    pub fn create_window(&mut self, title: String, bounds: Option<Bounds>) -> WindowState {
        self.z_counter += 1;

        // Offset new windows so they don't stack exactly
        let offset_bounds = bounds.map(|mut b| {
            b.x += ((self.windows.len() % 10) as f64) * 30.0;
            b.y += ((self.windows.len() % 10) as f64) * 30.0;
            b
        });

        let mut window = WindowState::new(title, offset_bounds, self.z_counter);
        window.bounds.clamp();

        // Unfocus all other windows
        for w in self.windows.values_mut() {
            w.focused = false;
        }

        self.windows.insert(window.id.clone(), window.clone());
        window
    }

    pub fn close_window(&mut self, id: &str) -> Result<WindowState, LunaError> {
        self.windows
            .remove(id)
            .ok_or_else(|| LunaError::Window(format!("Window not found: {}", id)))
    }

    pub fn resize_window(&mut self, id: &str, width: f64, height: f64) -> Result<&WindowState, LunaError> {
        let window = self
            .windows
            .get_mut(id)
            .ok_or_else(|| LunaError::Window(format!("Window not found: {}", id)))?;
        window.bounds.width = width;
        window.bounds.height = height;
        window.bounds.clamp();
        Ok(window)
    }

    pub fn move_window(&mut self, id: &str, x: f64, y: f64) -> Result<&WindowState, LunaError> {
        let window = self
            .windows
            .get_mut(id)
            .ok_or_else(|| LunaError::Window(format!("Window not found: {}", id)))?;
        window.bounds.x = x;
        window.bounds.y = y;
        Ok(window)
    }

    pub fn minimize_window(&mut self, id: &str) -> Result<&WindowState, LunaError> {
        let window = self
            .windows
            .get_mut(id)
            .ok_or_else(|| LunaError::Window(format!("Window not found: {}", id)))?;
        window.visibility = Visibility::Minimized;
        window.focused = false;
        Ok(window)
    }

    pub fn restore_window(&mut self, id: &str) -> Result<&WindowState, LunaError> {
        let window = self
            .windows
            .get_mut(id)
            .ok_or_else(|| LunaError::Window(format!("Window not found: {}", id)))?;
        window.visibility = Visibility::Visible;
        Ok(window)
    }

    pub fn focus_window(&mut self, id: &str) -> Result<&WindowState, LunaError> {
        // Check if window exists first
        if !self.windows.contains_key(id) {
            return Err(LunaError::Window(format!("Window not found: {}", id)));
        }

        self.z_counter += 1;

        // Unfocus all
        for w in self.windows.values_mut() {
            w.focused = false;
        }

        // Focus the target — safe because we checked contains_key above
        let window = self.windows.get_mut(id)
            .ok_or_else(|| LunaError::Window(format!("Window not found: {}", id)))?;
        window.focused = true;
        window.z_order = self.z_counter;
        window.visibility = Visibility::Visible;
        Ok(window)
    }

    pub fn get_all_windows(&self) -> Vec<&WindowState> {
        let mut windows: Vec<&WindowState> = self.windows.values().collect();
        windows.sort_by_key(|w| w.z_order);
        windows
    }

    pub fn get_window(&self, id: &str) -> Option<&WindowState> {
        self.windows.get(id)
    }

    pub fn set_content_type(&mut self, id: &str, content_type: super::types::WindowContentType) {
        if let Some(w) = self.windows.get_mut(id) {
            w.content_type = content_type;
        }
    }

    pub fn windows_mut(&mut self) -> &mut HashMap<WindowId, WindowState> {
        &mut self.windows
    }

    pub fn get_all_windows_owned(&self) -> Vec<WindowState> {
        let mut windows: Vec<WindowState> = self.windows.values().cloned().collect();
        windows.sort_by_key(|w| w.z_order);
        windows
    }

    pub fn restore_windows(&mut self, windows: Vec<WindowState>) {
        for w in windows {
            if w.z_order > self.z_counter {
                self.z_counter = w.z_order;
            }
            self.windows.insert(w.id.clone(), w);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_window_adds_with_correct_defaults() {
        let mut wm = WindowManager::new();
        let win = wm.create_window("Test Window".to_string(), None);
        assert_eq!(win.title, "Test Window");
        assert!(win.focused);
        assert_eq!(win.visibility, Visibility::Visible);
        assert_eq!(wm.get_all_windows().len(), 1);
    }

    #[test]
    fn test_close_window_removes_window() {
        let mut wm = WindowManager::new();
        let win = wm.create_window("To Close".to_string(), None);
        let id = win.id.clone();
        assert!(wm.close_window(&id).is_ok());
        assert_eq!(wm.get_all_windows().len(), 0);
    }

    #[test]
    fn test_close_window_returns_error_for_unknown() {
        let mut wm = WindowManager::new();
        assert!(wm.close_window("nonexistent").is_err());
    }

    #[test]
    fn test_focus_window_updates_z_order_and_focused() {
        let mut wm = WindowManager::new();
        let win1 = wm.create_window("Win 1".to_string(), None);
        let win2 = wm.create_window("Win 2".to_string(), None);
        let id1 = win1.id.clone();
        let id2 = win2.id.clone();

        // win2 is focused after creation; focus win1
        wm.focus_window(&id1).unwrap();
        let w1 = wm.get_window(&id1).unwrap();
        let w2 = wm.get_window(&id2).unwrap();
        assert!(w1.focused);
        assert!(!w2.focused);
        assert!(w1.z_order > w2.z_order);
    }

    #[test]
    fn test_minimize_window_sets_visibility() {
        let mut wm = WindowManager::new();
        let win = wm.create_window("Minimize Me".to_string(), None);
        let id = win.id.clone();
        wm.minimize_window(&id).unwrap();
        let w = wm.get_window(&id).unwrap();
        assert_eq!(w.visibility, Visibility::Minimized);
        assert!(!w.focused);
    }

    #[test]
    fn test_restore_window_sets_visibility_back() {
        let mut wm = WindowManager::new();
        let win = wm.create_window("Restore Me".to_string(), None);
        let id = win.id.clone();
        wm.minimize_window(&id).unwrap();
        wm.restore_window(&id).unwrap();
        let w = wm.get_window(&id).unwrap();
        assert_eq!(w.visibility, Visibility::Visible);
    }

    #[test]
    fn test_get_all_windows_owned_returns_all() {
        let mut wm = WindowManager::new();
        wm.create_window("A".to_string(), None);
        wm.create_window("B".to_string(), None);
        wm.create_window("C".to_string(), None);
        let all = wm.get_all_windows_owned();
        assert_eq!(all.len(), 3);
    }
}
