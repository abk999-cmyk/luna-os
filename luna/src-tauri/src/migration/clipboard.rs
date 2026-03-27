use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ClipboardFormat {
    PlainText,
    RichText,
    Html,
    Image,
    FileReference,
    LunaComponent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardEntry {
    pub format: ClipboardFormat,
    pub content: serde_json::Value,
    pub source: String, // "host_os" or "luna"
    pub timestamp: i64,
}

pub struct ClipboardBridge {
    history: Vec<ClipboardEntry>,
    max_history: usize,
}

impl ClipboardBridge {
    pub fn new(max_history: usize) -> Self {
        Self {
            history: Vec::new(),
            max_history,
        }
    }

    pub fn push(&mut self, entry: ClipboardEntry) {
        if self.history.len() >= self.max_history {
            self.history.remove(0);
        }
        self.history.push(entry);
    }

    pub fn recent(&self, n: usize) -> &[ClipboardEntry] {
        let start = self.history.len().saturating_sub(n);
        &self.history[start..]
    }

    pub fn translate_to_luna(&self, entry: &ClipboardEntry) -> serde_json::Value {
        match entry.format {
            ClipboardFormat::PlainText => serde_json::json!({
                "type": "text",
                "content": entry.content
            }),
            ClipboardFormat::Html => serde_json::json!({
                "type": "rich_text",
                "html": entry.content,
            }),
            ClipboardFormat::Image => serde_json::json!({
                "type": "image_reference",
                "data": entry.content,
            }),
            _ => serde_json::json!({
                "type": "raw",
                "content": entry.content,
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clipboard_bridge_push_and_recent() {
        let mut bridge = ClipboardBridge::new(3);
        for i in 0..5 {
            bridge.push(ClipboardEntry {
                format: ClipboardFormat::PlainText,
                content: serde_json::json!(format!("entry_{}", i)),
                source: "host_os".to_string(),
                timestamp: i,
            });
        }
        // Max 3, so only last 3 remain
        assert_eq!(bridge.history.len(), 3);
        let recent = bridge.recent(2);
        assert_eq!(recent.len(), 2);
    }

    #[test]
    fn test_translate_plain_text() {
        let bridge = ClipboardBridge::new(10);
        let entry = ClipboardEntry {
            format: ClipboardFormat::PlainText,
            content: serde_json::json!("hello"),
            source: "host_os".to_string(),
            timestamp: 0,
        };
        let result = bridge.translate_to_luna(&entry);
        assert_eq!(result["type"], "text");
        assert_eq!(result["content"], "hello");
    }

    #[test]
    fn test_translate_html() {
        let bridge = ClipboardBridge::new(10);
        let entry = ClipboardEntry {
            format: ClipboardFormat::Html,
            content: serde_json::json!("<b>bold</b>"),
            source: "luna".to_string(),
            timestamp: 0,
        };
        let result = bridge.translate_to_luna(&entry);
        assert_eq!(result["type"], "rich_text");
    }
}
