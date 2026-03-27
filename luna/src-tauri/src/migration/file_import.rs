use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::LunaError;

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum ImportedContent {
    Text { content: String, format: String },
    Structured { data: serde_json::Value, format: String },
    Binary { path: String, mime_type: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub file_name: String,
    pub content: ImportedContent,
    pub metadata: HashMap<String, String>,
}

// ── FileImporter ─────────────────────────────────────────────────────────────

pub struct FileImporter;

impl FileImporter {
    /// Detect format from extension and import accordingly.
    pub fn import_file(path: &Path) -> Result<ImportResult, LunaError> {
        let format = Self::detect_format(path);
        match format.as_str() {
            "markdown" | "text" => Self::import_markdown(path),
            "csv" => Self::import_csv(path),
            "json" => Self::import_json(path),
            "yaml" => Self::import_yaml(path),
            "rust" | "typescript" | "tsx" | "javascript" | "jsx" | "python" | "go"
            | "html" | "css" | "toml" => Self::import_code(path),
            "document" | "spreadsheet" | "pdf" | "image" | "media" => Self::import_binary_reference(path, &format),
            _ => Self::import_unknown(path),
        }
    }

    /// Parse a markdown (or plain-text) file.
    pub fn import_markdown(path: &Path) -> Result<ImportResult, LunaError> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| LunaError::Migration(format!("Failed to read {}: {}", path.display(), e)))?;

        let mut metadata = HashMap::new();
        metadata.insert("lines".to_string(), content.lines().count().to_string());

        Ok(ImportResult {
            file_name: file_name_str(path),
            content: ImportedContent::Text {
                content,
                format: Self::detect_format(path),
            },
            metadata,
        })
    }

    /// Parse a CSV file into a JSON array of objects.
    pub fn import_csv(path: &Path) -> Result<ImportResult, LunaError> {
        let raw = std::fs::read_to_string(path)
            .map_err(|e| LunaError::Migration(format!("Failed to read {}: {}", path.display(), e)))?;

        let mut lines = raw.lines();
        let headers: Vec<&str> = match lines.next() {
            Some(h) => h.split(',').map(|s| s.trim()).collect(),
            None => {
                return Ok(ImportResult {
                    file_name: file_name_str(path),
                    content: ImportedContent::Structured {
                        data: serde_json::Value::Array(vec![]),
                        format: "csv".to_string(),
                    },
                    metadata: HashMap::new(),
                });
            }
        };

        let mut rows: Vec<serde_json::Value> = Vec::new();
        for line in lines {
            let cols: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
            let mut obj = serde_json::Map::new();
            for (i, header) in headers.iter().enumerate() {
                let value = cols.get(i).unwrap_or(&"");
                obj.insert(header.to_string(), serde_json::Value::String(value.to_string()));
            }
            rows.push(serde_json::Value::Object(obj));
        }

        let mut metadata = HashMap::new();
        metadata.insert("rows".to_string(), rows.len().to_string());
        metadata.insert("columns".to_string(), headers.len().to_string());

        Ok(ImportResult {
            file_name: file_name_str(path),
            content: ImportedContent::Structured {
                data: serde_json::Value::Array(rows),
                format: "csv".to_string(),
            },
            metadata,
        })
    }

    /// Read a code file with language detection.
    pub fn import_code(path: &Path) -> Result<ImportResult, LunaError> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| LunaError::Migration(format!("Failed to read {}: {}", path.display(), e)))?;

        let format = Self::detect_format(path);
        let mut metadata = HashMap::new();
        metadata.insert("language".to_string(), format.clone());
        metadata.insert("lines".to_string(), content.lines().count().to_string());
        metadata.insert(
            "size_bytes".to_string(),
            content.len().to_string(),
        );

        Ok(ImportResult {
            file_name: file_name_str(path),
            content: ImportedContent::Text { content, format },
            metadata,
        })
    }

    /// Detect file format from extension.
    pub fn detect_format(path: &Path) -> String {
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        match ext.as_str() {
            "md" => "markdown".to_string(),
            "txt" => "text".to_string(),
            "csv" => "csv".to_string(),
            "json" => "json".to_string(),
            "rs" => "rust".to_string(),
            "ts" => "typescript".to_string(),
            "tsx" => "tsx".to_string(),
            "js" => "javascript".to_string(),
            "jsx" => "jsx".to_string(),
            "py" => "python".to_string(),
            "go" => "go".to_string(),
            "toml" => "toml".to_string(),
            "yaml" | "yml" => "yaml".to_string(),
            "html" => "html".to_string(),
            "css" => "css".to_string(),
            "docx" | "doc" => "document".to_string(),
            "xlsx" | "xls" => "spreadsheet".to_string(),
            "pdf" => "pdf".to_string(),
            "png" | "jpg" | "jpeg" | "gif" | "svg" => "image".to_string(),
            "mp4" | "mp3" | "wav" => "media".to_string(),
            other => other.to_string(),
        }
    }

    /// Returns the list of supported file extensions.
    pub fn supported_formats() -> Vec<&'static str> {
        vec![
            ".md", ".txt", ".csv", ".json", ".rs", ".ts", ".tsx", ".js", ".jsx",
            ".py", ".go", ".toml", ".yaml", ".yml", ".html", ".css",
            ".docx", ".doc", ".xlsx", ".xls", ".pdf",
            ".png", ".jpg", ".jpeg", ".gif", ".svg",
            ".mp4", ".mp3", ".wav",
        ]
    }

    /// Import a binary file (document, spreadsheet, pdf, image, media) as a
    /// metadata reference.  Full content extraction would require external
    /// libraries, so we store file metadata and a reference path instead.
    fn import_binary_reference(path: &Path, format: &str) -> Result<ImportResult, LunaError> {
        let meta = std::fs::metadata(path)
            .map_err(|e| LunaError::Migration(format!("Failed to read metadata for {}: {}", path.display(), e)))?;

        let extension = path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("unknown")
            .to_string();

        let mime_type = match format {
            "document" => format!("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            "spreadsheet" => format!("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            "pdf" => "application/pdf".to_string(),
            "image" => format!("image/{}", extension),
            "media" => {
                if extension == "mp4" { "video/mp4".to_string() }
                else { format!("audio/{}", extension) }
            }
            _ => "application/octet-stream".to_string(),
        };

        let mut metadata = HashMap::new();
        metadata.insert("format".to_string(), format.to_string());
        metadata.insert("extension".to_string(), extension);
        metadata.insert("size_bytes".to_string(), meta.len().to_string());
        metadata.insert("mime_type".to_string(), mime_type.clone());
        metadata.insert("note".to_string(), "Binary file stored as reference. Use native application to edit.".to_string());

        Ok(ImportResult {
            file_name: file_name_str(path),
            content: ImportedContent::Binary {
                path: path.to_string_lossy().to_string(),
                mime_type,
            },
            metadata,
        })
    }

    /// Graceful degradation for completely unknown/unsupported file formats.
    /// Stores a reference with metadata rather than returning an error.
    fn import_unknown(path: &Path) -> Result<ImportResult, LunaError> {
        let meta = std::fs::metadata(path)
            .map_err(|e| LunaError::Migration(format!("Failed to read metadata for {}: {}", path.display(), e)))?;

        let extension = path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("unknown")
            .to_string();

        let mut metadata = HashMap::new();
        metadata.insert("extension".to_string(), extension.clone());
        metadata.insert("size_bytes".to_string(), meta.len().to_string());
        metadata.insert("readonly".to_string(), "true".to_string());
        metadata.insert("note".to_string(), "Unsupported format stored as reference. Use native application to edit.".to_string());

        Ok(ImportResult {
            file_name: file_name_str(path),
            content: ImportedContent::Binary {
                path: path.to_string_lossy().to_string(),
                mime_type: "application/octet-stream".to_string(),
            },
            metadata,
        })
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    fn import_json(path: &Path) -> Result<ImportResult, LunaError> {
        let raw = std::fs::read_to_string(path)
            .map_err(|e| LunaError::Migration(format!("Failed to read {}: {}", path.display(), e)))?;

        let data: serde_json::Value = serde_json::from_str(&raw)?;

        let mut metadata = HashMap::new();
        metadata.insert("size_bytes".to_string(), raw.len().to_string());

        Ok(ImportResult {
            file_name: file_name_str(path),
            content: ImportedContent::Structured {
                data,
                format: "json".to_string(),
            },
            metadata,
        })
    }

    fn import_yaml(path: &Path) -> Result<ImportResult, LunaError> {
        // Read YAML as plain text (no serde_yaml dependency) and wrap as text content
        let content = std::fs::read_to_string(path)
            .map_err(|e| LunaError::Migration(format!("Failed to read {}: {}", path.display(), e)))?;

        let mut metadata = HashMap::new();
        metadata.insert("lines".to_string(), content.lines().count().to_string());

        Ok(ImportResult {
            file_name: file_name_str(path),
            content: ImportedContent::Text {
                content,
                format: "yaml".to_string(),
            },
            metadata,
        })
    }
}

fn file_name_str(path: &Path) -> String {
    path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string()
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_detect_format() {
        assert_eq!(FileImporter::detect_format(Path::new("foo.md")), "markdown");
        assert_eq!(FileImporter::detect_format(Path::new("bar.rs")), "rust");
        assert_eq!(FileImporter::detect_format(Path::new("baz.csv")), "csv");
        assert_eq!(FileImporter::detect_format(Path::new("x.py")), "python");
        assert_eq!(FileImporter::detect_format(Path::new("y.yml")), "yaml");
    }

    #[test]
    fn test_supported_formats_not_empty() {
        let fmts = FileImporter::supported_formats();
        assert!(fmts.len() >= 27);
        assert!(fmts.contains(&".md"));
        assert!(fmts.contains(&".rs"));
    }

    #[test]
    fn test_import_markdown() {
        let mut f = NamedTempFile::with_suffix(".md").unwrap();
        writeln!(f, "# Hello\n\nWorld").unwrap();
        let result = FileImporter::import_file(f.path()).unwrap();
        assert_eq!(result.file_name, f.path().file_name().unwrap().to_str().unwrap());
        match &result.content {
            ImportedContent::Text { format, .. } => assert_eq!(format, "markdown"),
            _ => panic!("expected Text"),
        }
    }

    #[test]
    fn test_import_csv() {
        let mut f = NamedTempFile::with_suffix(".csv").unwrap();
        writeln!(f, "name,age\nAlice,30\nBob,25").unwrap();
        let result = FileImporter::import_file(f.path()).unwrap();
        match &result.content {
            ImportedContent::Structured { data, format } => {
                assert_eq!(format, "csv");
                let arr = data.as_array().unwrap();
                assert_eq!(arr.len(), 2);
                assert_eq!(arr[0]["name"], "Alice");
            }
            _ => panic!("expected Structured"),
        }
    }

    #[test]
    fn test_import_json() {
        let mut f = NamedTempFile::with_suffix(".json").unwrap();
        writeln!(f, r#"{{"key": "value"}}"#).unwrap();
        let result = FileImporter::import_file(f.path()).unwrap();
        match &result.content {
            ImportedContent::Structured { data, format } => {
                assert_eq!(format, "json");
                assert_eq!(data["key"], "value");
            }
            _ => panic!("expected Structured"),
        }
    }
}
