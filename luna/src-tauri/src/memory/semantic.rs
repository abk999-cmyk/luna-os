use std::collections::{HashMap, HashSet, VecDeque};
use std::fmt;
use std::str::FromStr;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use crate::error::LunaError;
use crate::persistence::db::Database;

// ── Node & Edge types ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum NodeType {
    Person,
    Project,
    File,
    Codebase,
    Concept,
    Preference,
    Technology,
    WorkflowPattern,
    Team,
    Artifact,
}

impl fmt::Display for NodeType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            NodeType::Person => "person",
            NodeType::Project => "project",
            NodeType::File => "file",
            NodeType::Codebase => "codebase",
            NodeType::Concept => "concept",
            NodeType::Preference => "preference",
            NodeType::Technology => "technology",
            NodeType::WorkflowPattern => "workflow_pattern",
            NodeType::Team => "team",
            NodeType::Artifact => "artifact",
        };
        write!(f, "{}", s)
    }
}

impl FromStr for NodeType {
    type Err = LunaError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "person" => Ok(NodeType::Person),
            "project" => Ok(NodeType::Project),
            "file" => Ok(NodeType::File),
            "codebase" => Ok(NodeType::Codebase),
            "concept" => Ok(NodeType::Concept),
            "preference" => Ok(NodeType::Preference),
            "technology" => Ok(NodeType::Technology),
            "workflow_pattern" => Ok(NodeType::WorkflowPattern),
            "team" => Ok(NodeType::Team),
            "artifact" => Ok(NodeType::Artifact),
            other => Err(LunaError::Database(format!("Unknown node type: {}", other))),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RelationshipType {
    WorksOn,
    Prefers,
    DependsOn,
    RelatedTo,
    Contains,
    UsesTechnology,
    Authored,
    CollaboratesWith,
    Implements,
    References,
    Requires,
    HasProperty,
    Contradicts,
    EvolvedFrom,
}

impl fmt::Display for RelationshipType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            RelationshipType::WorksOn => "works_on",
            RelationshipType::Prefers => "prefers",
            RelationshipType::DependsOn => "depends_on",
            RelationshipType::RelatedTo => "related_to",
            RelationshipType::Contains => "contains",
            RelationshipType::UsesTechnology => "uses_technology",
            RelationshipType::Authored => "authored",
            RelationshipType::CollaboratesWith => "collaborates_with",
            RelationshipType::Implements => "implements",
            RelationshipType::References => "references",
            RelationshipType::Requires => "requires",
            RelationshipType::HasProperty => "has_property",
            RelationshipType::Contradicts => "contradicts",
            RelationshipType::EvolvedFrom => "evolved_from",
        };
        write!(f, "{}", s)
    }
}

impl FromStr for RelationshipType {
    type Err = LunaError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "works_on" => Ok(RelationshipType::WorksOn),
            "prefers" => Ok(RelationshipType::Prefers),
            "depends_on" => Ok(RelationshipType::DependsOn),
            "related_to" => Ok(RelationshipType::RelatedTo),
            "contains" => Ok(RelationshipType::Contains),
            "uses_technology" => Ok(RelationshipType::UsesTechnology),
            "authored" => Ok(RelationshipType::Authored),
            "collaborates_with" => Ok(RelationshipType::CollaboratesWith),
            "implements" => Ok(RelationshipType::Implements),
            "references" => Ok(RelationshipType::References),
            "requires" => Ok(RelationshipType::Requires),
            "has_property" => Ok(RelationshipType::HasProperty),
            "contradicts" => Ok(RelationshipType::Contradicts),
            "evolved_from" => Ok(RelationshipType::EvolvedFrom),
            other => Err(LunaError::Database(format!("Unknown relationship type: {}", other))),
        }
    }
}

// ── Data structs ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticNode {
    pub id: String,
    pub node_type: NodeType,
    pub name: String,
    pub description: Option<String>,
    pub properties: serde_json::Value,
    pub confidence_score: f64,
    pub tags: Vec<String>,
    pub source: String,
    pub access_frequency: u32,
    pub last_accessed: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticEdge {
    pub id: String,
    pub source_id: String,
    pub target_id: String,
    pub relationship_type: RelationshipType,
    pub properties: serde_json::Value,
    pub weight: f64,
    pub episodic_evidence: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

// ── SemanticMemory ───────────────────────────────────────────────────────────

/// Semantic memory — a property graph for facts and knowledge,
/// with backward-compatible key-value store methods.
pub struct SemanticMemory {
    db: Arc<Mutex<Database>>,
}

impl SemanticMemory {
    pub fn new(db: Arc<Mutex<Database>>) -> Self {
        Self { db }
    }

    // === Legacy KV methods (backward compat) ===

    pub async fn store(&self, key: &str, value: &str, tags: &[String]) -> Result<(), LunaError> {
        let db = self.db.lock().await;
        let tags_str = serde_json::to_string(&tags)?;
        db.semantic_store(key, value, &tags_str)?;
        Ok(())
    }

    pub async fn get(&self, key: &str) -> Result<Option<String>, LunaError> {
        let db = self.db.lock().await;
        db.semantic_get(key)
    }

    pub async fn search_by_tag(&self, tag: &str) -> Result<Vec<(String, String)>, LunaError> {
        let db = self.db.lock().await;
        db.semantic_search_by_tag(tag)
    }

    pub async fn delete(&self, key: &str) -> Result<bool, LunaError> {
        let db = self.db.lock().await;
        db.semantic_delete(key)
    }

    // === Node operations ===

    pub async fn add_node(&self, node: &SemanticNode) -> Result<(), LunaError> {
        let db = self.db.lock().await;
        db.graph_insert_node(node)
    }

    pub async fn get_node(&self, id: &str) -> Result<Option<SemanticNode>, LunaError> {
        let db = self.db.lock().await;
        db.graph_get_node(id)
    }

    pub async fn get_nodes_by_type(&self, node_type: &NodeType) -> Result<Vec<SemanticNode>, LunaError> {
        let db = self.db.lock().await;
        db.graph_get_nodes_by_type(&node_type.to_string())
    }

    pub async fn search_nodes_by_name(&self, name_query: &str) -> Result<Vec<SemanticNode>, LunaError> {
        let db = self.db.lock().await;
        db.graph_search_nodes_by_name(name_query)
    }

    pub async fn update_node(&self, node: &SemanticNode) -> Result<(), LunaError> {
        let db = self.db.lock().await;
        db.graph_update_node(node)
    }

    pub async fn delete_node(&self, id: &str) -> Result<(), LunaError> {
        let db = self.db.lock().await;
        db.graph_delete_edges_for_node(id)?;
        db.graph_delete_node(id)
    }

    pub async fn touch_node(&self, id: &str) -> Result<(), LunaError> {
        let db = self.db.lock().await;
        db.graph_touch_node(id)
    }

    // === Edge operations ===

    pub async fn add_edge(&self, edge: &SemanticEdge) -> Result<(), LunaError> {
        let db = self.db.lock().await;
        db.graph_insert_edge(edge)
    }

    pub async fn get_edge(&self, id: &str) -> Result<Option<SemanticEdge>, LunaError> {
        let db = self.db.lock().await;
        db.graph_get_edge(id)
    }

    pub async fn get_edges_from(&self, source_id: &str) -> Result<Vec<SemanticEdge>, LunaError> {
        let db = self.db.lock().await;
        db.graph_get_edges_from(source_id)
    }

    pub async fn get_edges_to(&self, target_id: &str) -> Result<Vec<SemanticEdge>, LunaError> {
        let db = self.db.lock().await;
        db.graph_get_edges_to(target_id)
    }

    pub async fn get_edges_between(&self, source_id: &str, target_id: &str) -> Result<Vec<SemanticEdge>, LunaError> {
        let db = self.db.lock().await;
        db.graph_get_edges_between(source_id, target_id)
    }

    pub async fn get_edges_by_type(&self, rel_type: &RelationshipType) -> Result<Vec<SemanticEdge>, LunaError> {
        let db = self.db.lock().await;
        db.graph_get_edges_by_type(&rel_type.to_string())
    }

    pub async fn update_edge_weight(&self, id: &str, new_weight: f64) -> Result<(), LunaError> {
        let db = self.db.lock().await;
        db.graph_update_edge_weight(id, new_weight)
    }

    pub async fn delete_edge(&self, id: &str) -> Result<(), LunaError> {
        let db = self.db.lock().await;
        db.graph_delete_edge(id)
    }

    // === Graph traversal ===

    /// Gets immediate neighbors (both outgoing and incoming edges).
    pub async fn get_neighbors(&self, node_id: &str) -> Result<Vec<(SemanticEdge, SemanticNode)>, LunaError> {
        let db = self.db.lock().await;
        let outgoing = db.graph_get_edges_from(node_id)?;
        let incoming = db.graph_get_edges_to(node_id)?;

        let mut results = Vec::new();
        for edge in outgoing {
            if let Some(node) = db.graph_get_node(&edge.target_id)? {
                results.push((edge, node));
            }
        }
        for edge in incoming {
            if let Some(node) = db.graph_get_node(&edge.source_id)? {
                results.push((edge, node));
            }
        }
        Ok(results)
    }

    /// BFS traversal up to `depth`, returns (node, distance) pairs.
    pub async fn traverse(&self, start_id: &str, depth: u32, max_results: usize) -> Result<Vec<(SemanticNode, u32)>, LunaError> {
        let db = self.db.lock().await;

        let mut visited: HashSet<String> = HashSet::new();
        let mut queue: VecDeque<(String, u32)> = VecDeque::new();
        let mut results: Vec<(SemanticNode, u32)> = Vec::new();

        visited.insert(start_id.to_string());
        queue.push_back((start_id.to_string(), 0));

        while let Some((current_id, dist)) = queue.pop_front() {
            if let Some(node) = db.graph_get_node(&current_id)? {
                results.push((node, dist));
                if results.len() >= max_results {
                    break;
                }
            }

            if dist < depth {
                let outgoing = db.graph_get_edges_from(&current_id)?;
                let incoming = db.graph_get_edges_to(&current_id)?;

                for edge in outgoing {
                    if visited.insert(edge.target_id.clone()) {
                        queue.push_back((edge.target_id, dist + 1));
                    }
                }
                for edge in incoming {
                    if visited.insert(edge.source_id.clone()) {
                        queue.push_back((edge.source_id, dist + 1));
                    }
                }
            }
        }

        Ok(results)
    }

    /// Gets related nodes ordered by edge weight DESC.
    pub async fn get_related_nodes(&self, node_id: &str, limit: usize) -> Result<Vec<SemanticNode>, LunaError> {
        let db = self.db.lock().await;
        let outgoing = db.graph_get_edges_from(node_id)?;
        let incoming = db.graph_get_edges_to(node_id)?;

        // Collect (neighbor_id, max_weight)
        let mut weight_map: HashMap<String, f64> = HashMap::new();
        for edge in &outgoing {
            let entry = weight_map.entry(edge.target_id.clone()).or_insert(0.0);
            if edge.weight > *entry {
                *entry = edge.weight;
            }
        }
        for edge in &incoming {
            let entry = weight_map.entry(edge.source_id.clone()).or_insert(0.0);
            if edge.weight > *entry {
                *entry = edge.weight;
            }
        }

        // Sort by weight descending
        let mut sorted: Vec<(String, f64)> = weight_map.into_iter().collect();
        sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        sorted.truncate(limit);

        let mut results = Vec::new();
        for (nid, _) in sorted {
            if let Some(node) = db.graph_get_node(&nid)? {
                results.push(node);
            }
        }
        Ok(results)
    }

    // === Confidence ===

    /// Bayesian update: new_confidence = 0.7 * current + 0.3 * new_evidence_score
    pub async fn update_confidence(&self, node_id: &str, new_evidence_score: f64) -> Result<(), LunaError> {
        let db = self.db.lock().await;
        if let Some(node) = db.graph_get_node(node_id)? {
            let new_confidence = 0.7 * node.confidence_score + 0.3 * new_evidence_score;
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as i64;

            let updated = SemanticNode {
                confidence_score: new_confidence,
                updated_at: now,
                ..node
            };
            db.graph_update_node(&updated)?;
        }
        Ok(())
    }
}

// ── AgentStateStore (preserved as-is) ────────────────────────────────────────

/// Per-agent persistent state store.
pub struct AgentStateStore {
    db: Arc<Mutex<Database>>,
}

impl AgentStateStore {
    pub fn new(db: Arc<Mutex<Database>>) -> Self {
        Self { db }
    }

    pub async fn load(&self, agent_id: &str) -> Result<serde_json::Value, LunaError> {
        let db = self.db.lock().await;
        if let Some(state) = db.agent_state_load(agent_id)? {
            return Ok(state);
        }
        Ok(serde_json::json!({
            "token_counts": { "input": 0, "output": 0 },
            "preferences": {},
            "capability_registry": []
        }))
    }

    pub async fn save(&self, agent_id: &str, state: &serde_json::Value) -> Result<(), LunaError> {
        let db = self.db.lock().await;
        db.agent_state_save(agent_id, state)?;
        Ok(())
    }

    /// Increment token usage counts for an agent.
    pub async fn record_tokens(&self, agent_id: &str, input: u32, output: u32) -> Result<(), LunaError> {
        let mut state = self.load(agent_id).await?;
        let counts = state.get_mut("token_counts")
            .and_then(|v| v.as_object_mut())
            .cloned()
            .unwrap_or_default();

        let total_input = counts.get("input").and_then(|v| v.as_u64()).unwrap_or(0) + input as u64;
        let total_output = counts.get("output").and_then(|v| v.as_u64()).unwrap_or(0) + output as u64;

        if let Some(obj) = state.as_object_mut() {
            obj.insert("token_counts".to_string(), serde_json::json!({
                "input": total_input,
                "output": total_output
            }));
        }
        self.save(agent_id, &state).await
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_memory() -> SemanticMemory {
        let db = Database::new(":memory:").expect("in-memory DB");
        let db = Arc::new(Mutex::new(db));
        SemanticMemory::new(db)
    }

    fn now_ms() -> i64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64
    }

    fn make_node(id: &str, name: &str, node_type: NodeType) -> SemanticNode {
        let ts = now_ms();
        SemanticNode {
            id: id.to_string(),
            node_type,
            name: name.to_string(),
            description: None,
            properties: serde_json::json!({}),
            confidence_score: 0.5,
            tags: vec![],
            source: "explicit".to_string(),
            access_frequency: 0,
            last_accessed: ts,
            created_at: ts,
            updated_at: ts,
        }
    }

    fn make_edge(id: &str, source: &str, target: &str, rel: RelationshipType, weight: f64) -> SemanticEdge {
        let ts = now_ms();
        SemanticEdge {
            id: id.to_string(),
            source_id: source.to_string(),
            target_id: target.to_string(),
            relationship_type: rel,
            properties: serde_json::json!({}),
            weight,
            episodic_evidence: vec![],
            created_at: ts,
            updated_at: ts,
        }
    }

    #[tokio::test]
    async fn test_add_and_retrieve_node() {
        let mem = make_memory();
        let node = make_node("n1", "Alice", NodeType::Person);
        mem.add_node(&node).await.unwrap();

        let retrieved = mem.get_node("n1").await.unwrap().expect("node should exist");
        assert_eq!(retrieved.name, "Alice");
        assert_eq!(retrieved.node_type, NodeType::Person);
    }

    #[tokio::test]
    async fn test_search_nodes_by_type() {
        let mem = make_memory();
        mem.add_node(&make_node("n1", "Alice", NodeType::Person)).await.unwrap();
        mem.add_node(&make_node("n2", "Bob", NodeType::Person)).await.unwrap();
        mem.add_node(&make_node("n3", "Luna", NodeType::Project)).await.unwrap();

        let people = mem.get_nodes_by_type(&NodeType::Person).await.unwrap();
        assert_eq!(people.len(), 2);

        let projects = mem.get_nodes_by_type(&NodeType::Project).await.unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].name, "Luna");
    }

    #[tokio::test]
    async fn test_search_nodes_by_name() {
        let mem = make_memory();
        mem.add_node(&make_node("n1", "Alice Smith", NodeType::Person)).await.unwrap();
        mem.add_node(&make_node("n2", "Bob Alice", NodeType::Person)).await.unwrap();
        mem.add_node(&make_node("n3", "Charlie", NodeType::Person)).await.unwrap();

        let results = mem.search_nodes_by_name("Alice").await.unwrap();
        assert_eq!(results.len(), 2);
    }

    #[tokio::test]
    async fn test_add_edge_between_nodes() {
        let mem = make_memory();
        mem.add_node(&make_node("n1", "Alice", NodeType::Person)).await.unwrap();
        mem.add_node(&make_node("n2", "Luna", NodeType::Project)).await.unwrap();

        let edge = make_edge("e1", "n1", "n2", RelationshipType::WorksOn, 0.8);
        mem.add_edge(&edge).await.unwrap();

        let retrieved = mem.get_edge("e1").await.unwrap().expect("edge should exist");
        assert_eq!(retrieved.source_id, "n1");
        assert_eq!(retrieved.target_id, "n2");
        assert_eq!(retrieved.relationship_type, RelationshipType::WorksOn);
        assert!((retrieved.weight - 0.8).abs() < f64::EPSILON);
    }

    #[tokio::test]
    async fn test_get_neighbors() {
        let mem = make_memory();
        mem.add_node(&make_node("n1", "Alice", NodeType::Person)).await.unwrap();
        mem.add_node(&make_node("n2", "Luna", NodeType::Project)).await.unwrap();
        mem.add_node(&make_node("n3", "Rust", NodeType::Technology)).await.unwrap();

        mem.add_edge(&make_edge("e1", "n1", "n2", RelationshipType::WorksOn, 0.8)).await.unwrap();
        mem.add_edge(&make_edge("e2", "n3", "n1", RelationshipType::RelatedTo, 0.5)).await.unwrap();

        let neighbors = mem.get_neighbors("n1").await.unwrap();
        assert_eq!(neighbors.len(), 2);

        let neighbor_names: Vec<String> = neighbors.iter().map(|(_, n)| n.name.clone()).collect();
        assert!(neighbor_names.contains(&"Luna".to_string()));
        assert!(neighbor_names.contains(&"Rust".to_string()));
    }

    #[tokio::test]
    async fn test_bfs_traverse_depth_2() {
        let mem = make_memory();
        mem.add_node(&make_node("a", "A", NodeType::Concept)).await.unwrap();
        mem.add_node(&make_node("b", "B", NodeType::Concept)).await.unwrap();
        mem.add_node(&make_node("c", "C", NodeType::Concept)).await.unwrap();
        mem.add_node(&make_node("d", "D", NodeType::Concept)).await.unwrap();

        // a -> b -> c -> d
        mem.add_edge(&make_edge("e1", "a", "b", RelationshipType::RelatedTo, 0.5)).await.unwrap();
        mem.add_edge(&make_edge("e2", "b", "c", RelationshipType::RelatedTo, 0.5)).await.unwrap();
        mem.add_edge(&make_edge("e3", "c", "d", RelationshipType::RelatedTo, 0.5)).await.unwrap();

        let results = mem.traverse("a", 2, 100).await.unwrap();
        assert_eq!(results.len(), 3);

        let ids: Vec<&str> = results.iter().map(|(n, _)| n.id.as_str()).collect();
        assert!(ids.contains(&"a"));
        assert!(ids.contains(&"b"));
        assert!(ids.contains(&"c"));
        assert!(!ids.contains(&"d"));

        let dist_map: HashMap<&str, u32> = results.iter().map(|(n, d)| (n.id.as_str(), *d)).collect();
        assert_eq!(dist_map["a"], 0);
        assert_eq!(dist_map["b"], 1);
        assert_eq!(dist_map["c"], 2);
    }

    #[tokio::test]
    async fn test_update_confidence_bayesian() {
        let mem = make_memory();
        let node = make_node("n1", "Fact", NodeType::Concept);
        assert!((node.confidence_score - 0.5).abs() < f64::EPSILON);
        mem.add_node(&node).await.unwrap();

        mem.update_confidence("n1", 1.0).await.unwrap();
        let updated = mem.get_node("n1").await.unwrap().unwrap();
        assert!((updated.confidence_score - 0.65).abs() < 0.001);

        mem.update_confidence("n1", 1.0).await.unwrap();
        let updated2 = mem.get_node("n1").await.unwrap().unwrap();
        assert!((updated2.confidence_score - 0.755).abs() < 0.001);
    }

    #[tokio::test]
    async fn test_delete_node_cascades_to_edges() {
        let mem = make_memory();
        mem.add_node(&make_node("n1", "Alice", NodeType::Person)).await.unwrap();
        mem.add_node(&make_node("n2", "Luna", NodeType::Project)).await.unwrap();
        mem.add_node(&make_node("n3", "Rust", NodeType::Technology)).await.unwrap();

        mem.add_edge(&make_edge("e1", "n1", "n2", RelationshipType::WorksOn, 0.8)).await.unwrap();
        mem.add_edge(&make_edge("e2", "n1", "n3", RelationshipType::UsesTechnology, 0.7)).await.unwrap();
        mem.add_edge(&make_edge("e3", "n3", "n2", RelationshipType::RelatedTo, 0.5)).await.unwrap();

        mem.delete_node("n1").await.unwrap();

        assert!(mem.get_node("n1").await.unwrap().is_none());
        assert!(mem.get_edge("e1").await.unwrap().is_none());
        assert!(mem.get_edge("e2").await.unwrap().is_none());
        assert!(mem.get_edge("e3").await.unwrap().is_some());
    }
}
