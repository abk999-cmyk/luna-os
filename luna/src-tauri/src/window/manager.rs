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
            b.x += (self.windows.len() as f64) * 30.0;
            b.y += (self.windows.len() as f64) * 30.0;
            b
        });

        let window = WindowState::new(title, offset_bounds, self.z_counter);

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

        // Focus the target
        let window = self.windows.get_mut(id).unwrap();
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
