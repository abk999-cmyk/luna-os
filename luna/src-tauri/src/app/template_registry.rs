use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::app::descriptor::AppDescriptor;
use crate::error::LunaError;
use crate::persistence::db::Database;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub tags: Vec<String>,
    pub descriptor: AppDescriptor,
    pub created_at: i64,
    pub use_count: u32,
}

fn template_from_row(row: &serde_json::Value) -> Option<AppTemplate> {
    let id = row.get("id")?.as_str()?.to_string();
    let name = row.get("name")?.as_str()?.to_string();
    let description = row.get("description")?.as_str()?.to_string();
    let category = row.get("category")?.as_str()?.to_string();
    let tags_str = row.get("tags")?.as_str()?;
    let tags: Vec<String> = serde_json::from_str(tags_str).unwrap_or_default();
    let descriptor_json = row.get("descriptor_json")?.as_str()?;
    let descriptor: AppDescriptor = serde_json::from_str(descriptor_json).ok()?;
    let created_at = row.get("created_at")?.as_i64()?;
    let use_count = row.get("use_count")?.as_u64()? as u32;

    Some(AppTemplate {
        id,
        name,
        description,
        category,
        tags,
        descriptor,
        created_at,
        use_count,
    })
}

pub struct TemplateRegistry {
    db: Arc<tokio::sync::Mutex<Database>>,
}

impl TemplateRegistry {
    pub fn new(db: Arc<tokio::sync::Mutex<Database>>) -> Self {
        Self { db }
    }

    /// Save a running app's current state as a template.
    pub fn save_as_template(
        &self,
        name: &str,
        description: &str,
        category: &str,
        tags: Vec<String>,
        descriptor: &AppDescriptor,
    ) -> Result<AppTemplate, LunaError> {
        let id = uuid::Uuid::new_v4().to_string();
        let created_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let tags_json = serde_json::to_string(&tags)?;
        let descriptor_json = serde_json::to_string(descriptor)?;

        let database = self.db.blocking_lock();
        database.template_save(&id, name, description, category, &tags_json, &descriptor_json, created_at)?;

        Ok(AppTemplate {
            id,
            name: name.to_string(),
            description: description.to_string(),
            category: category.to_string(),
            tags,
            descriptor: descriptor.clone(),
            created_at,
            use_count: 0,
        })
    }

    /// Get a template by ID.
    pub fn get_template(&self, id: &str) -> Result<Option<AppTemplate>, LunaError> {
        let database = self.db.blocking_lock();
        let row = database.template_get(id)?;
        Ok(row.as_ref().and_then(template_from_row))
    }

    /// List all templates.
    pub fn list_templates(&self) -> Result<Vec<AppTemplate>, LunaError> {
        let database = self.db.blocking_lock();
        let rows = database.template_list()?;
        Ok(rows.iter().filter_map(template_from_row).collect())
    }

    /// Search templates by name/description/tags.
    pub fn search_templates(&self, query: &str) -> Result<Vec<AppTemplate>, LunaError> {
        let database = self.db.blocking_lock();
        let rows = database.template_search(query)?;
        Ok(rows.iter().filter_map(template_from_row).collect())
    }

    /// Delete a template.
    pub fn delete_template(&self, id: &str) -> Result<(), LunaError> {
        let database = self.db.blocking_lock();
        database.template_delete(id)
    }

    /// Instantiate an app from a template.
    /// Returns a new AppDescriptor with a fresh ID and customized title.
    pub fn instantiate(
        &self,
        template_id: &str,
        new_app_id: &str,
        new_title: Option<&str>,
    ) -> Result<AppDescriptor, LunaError> {
        let template = self.get_template(template_id)?.ok_or_else(|| {
            LunaError::Dispatch(format!("Template not found: {}", template_id))
        })?;

        let mut desc = template.descriptor.clone();
        desc.id = new_app_id.to_string();
        if let Some(title) = new_title {
            desc.title = title.to_string();
        }

        // Increment use count
        {
            let database = self.db.blocking_lock();
            database.template_increment_use(template_id)?;
        }

        Ok(desc)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app::descriptor::{AppDescriptor, ComponentSpec};

    fn make_component(id: &str, ctype: &str) -> ComponentSpec {
        ComponentSpec {
            id: id.to_string(),
            component_type: ctype.to_string(),
            props: serde_json::Value::Null,
            children: vec![],
            events: serde_json::Map::new(),
            layout: serde_json::Value::Null,
        }
    }

    fn make_descriptor(id: &str, title: &str) -> AppDescriptor {
        AppDescriptor {
            version: "1.0".to_string(),
            app_type: "application".to_string(),
            id: id.to_string(),
            title: title.to_string(),
            description: None,
            layout: serde_json::json!("vertical"),
            width: None,
            height: None,
            components: vec![make_component("btn1", "button")],
            actions: vec![],
            styles: serde_json::Value::Null,
            data: serde_json::Value::Null,
        }
    }

    fn make_registry() -> TemplateRegistry {
        let db = Database::new(":memory:").unwrap();
        let db = Arc::new(tokio::sync::Mutex::new(db));
        TemplateRegistry::new(db)
    }

    #[test]
    fn test_save_and_retrieve_template() {
        let registry = make_registry();
        let desc = make_descriptor("app_1", "My App");
        let template = registry
            .save_as_template("My Template", "A test template", "productivity", vec!["test".to_string()], &desc)
            .unwrap();
        assert_eq!(template.name, "My Template");
        assert_eq!(template.category, "productivity");

        let retrieved = registry.get_template(&template.id).unwrap().unwrap();
        assert_eq!(retrieved.name, "My Template");
        assert_eq!(retrieved.descriptor.title, "My App");
    }

    #[test]
    fn test_list_templates() {
        let registry = make_registry();
        let desc1 = make_descriptor("app_1", "App One");
        let desc2 = make_descriptor("app_2", "App Two");
        registry
            .save_as_template("Template 1", "First", "productivity", vec![], &desc1)
            .unwrap();
        registry
            .save_as_template("Template 2", "Second", "data", vec![], &desc2)
            .unwrap();

        let list = registry.list_templates().unwrap();
        assert_eq!(list.len(), 2);
    }

    #[test]
    fn test_search_by_name() {
        let registry = make_registry();
        let desc = make_descriptor("app_1", "My App");
        registry
            .save_as_template("Calculator Template", "A calculator", "utility", vec!["math".to_string()], &desc)
            .unwrap();
        registry
            .save_as_template("Notes App", "A notes app", "productivity", vec!["notes".to_string()], &desc)
            .unwrap();

        let results = registry.search_templates("Calculator").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Calculator Template");

        // Search by tag
        let results = registry.search_templates("notes").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Notes App");
    }

    #[test]
    fn test_instantiate_creates_new_descriptor() {
        let registry = make_registry();
        let desc = make_descriptor("original_id", "Original Title");
        let template = registry
            .save_as_template("My Template", "desc", "general", vec![], &desc)
            .unwrap();

        let new_desc = registry
            .instantiate(&template.id, "new_app_id", Some("New Title"))
            .unwrap();
        assert_eq!(new_desc.id, "new_app_id");
        assert_eq!(new_desc.title, "New Title");

        // Verify use count incremented
        let updated = registry.get_template(&template.id).unwrap().unwrap();
        assert_eq!(updated.use_count, 1);
    }

    #[test]
    fn test_delete_template() {
        let registry = make_registry();
        let desc = make_descriptor("app_1", "My App");
        let template = registry
            .save_as_template("To Delete", "will be deleted", "general", vec![], &desc)
            .unwrap();

        registry.delete_template(&template.id).unwrap();

        let result = registry.get_template(&template.id).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_instantiate_without_new_title_keeps_original() {
        let registry = make_registry();
        let desc = make_descriptor("original_id", "Original Title");
        let template = registry
            .save_as_template("My Template", "desc", "general", vec![], &desc)
            .unwrap();

        let new_desc = registry
            .instantiate(&template.id, "new_app_id", None)
            .unwrap();
        assert_eq!(new_desc.id, "new_app_id");
        assert_eq!(new_desc.title, "Original Title");
    }
}
