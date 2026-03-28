import { useState, useEffect, useCallback } from 'react';
import {
  queryEpisodicByAgent,
  searchSemanticMemory,
  deleteSemanticMemory,
  type SemanticEntry,
} from '../../ipc/memory';

type Tab = 'episodic' | 'semantic' | 'procedural';

export function MemoryInspector() {
  const [activeTab, setActiveTab] = useState<Tab>('episodic');

  return (
    <div className="memory-inspector">
      <div className="memory-inspector__tabs">
        {(['episodic', 'semantic', 'procedural'] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`memory-inspector__tab ${activeTab === tab ? 'memory-inspector__tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="memory-inspector__body">
        {activeTab === 'episodic' && <EpisodicTab />}
        {activeTab === 'semantic' && <SemanticTab />}
        {activeTab === 'procedural' && <ProceduralTab />}
      </div>
    </div>
  );
}

function EpisodicTab() {
  const [entries, setEntries] = useState<unknown[]>([]);
  const [agent, setAgent] = useState('conductor');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await queryEpisodicByAgent(agent, 50);
      setEntries(data);
    } catch {
      setEntries([]);
    }
    setLoading(false);
  }, [agent]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          className="memory-inspector__search"
          placeholder="Agent ID..."
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
          style={{ marginBottom: 0 }}
        />
        <button className="undo-entry__btn" onClick={load} style={{ flexShrink: 0 }}>
          Search
        </button>
      </div>

      {loading && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Loading...</div>}

      {entries.map((entry, idx) => {
        const e = entry as Record<string, unknown>;
        return (
          <div key={idx} className="memory-entry">
            <div className="memory-entry__key">
              {String(e.event_type || e.key || `Entry ${idx + 1}`)}
            </div>
            <div className="memory-entry__value">
              {String(e.summary || e.value || JSON.stringify(e))}
            </div>
            {e.timestamp != null && (
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                {new Date(Number(e.timestamp) * 1000).toLocaleString()}
              </div>
            )}
          </div>
        );
      })}

      {!loading && entries.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', padding: 16 }}>
          No episodic memories found for "{agent}"
        </div>
      )}
    </div>
  );
}

function SemanticTab() {
  const [entries, setEntries] = useState<SemanticEntry[]>([]);
  const [tag, setTag] = useState('');
  const [loading, setLoading] = useState(false);

  const search = useCallback(async () => {
    if (!tag.trim()) return;
    setLoading(true);
    try {
      const data = await searchSemanticMemory(tag.trim());
      setEntries(data);
    } catch {
      setEntries([]);
    }
    setLoading(false);
  }, [tag]);

  const handleDelete = useCallback(async (key: string) => {
    try {
      await deleteSemanticMemory(key);
      setEntries((prev) => prev.filter((e) => e.key !== key));
    } catch (e) {
      console.error('Failed to delete semantic memory:', e);
    }
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          className="memory-inspector__search"
          placeholder="Search by tag..."
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          style={{ marginBottom: 0 }}
        />
        <button className="undo-entry__btn" onClick={search} style={{ flexShrink: 0 }}>
          Search
        </button>
      </div>

      {loading && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Loading...</div>}

      {entries.map((entry) => (
        <div key={entry.key} className="memory-entry">
          <div className="memory-entry__key">{entry.key}</div>
          <div className="memory-entry__value">{entry.value}</div>
          {entry.tags.length > 0 && (
            <div className="memory-entry__tags">
              {entry.tags.map((t) => (
                <span key={t} className="memory-entry__tag">{t}</span>
              ))}
            </div>
          )}
          <div className="memory-entry__actions">
            <button
              className="memory-entry__delete"
              onClick={() => handleDelete(entry.key)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}

      {!loading && entries.length === 0 && tag && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', padding: 16 }}>
          No semantic entries found for tag "{tag}"
        </div>
      )}
    </div>
  );
}

function ProceduralTab() {
  return (
    <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', padding: 24 }}>
      Procedural memory stores learned workflows and action sequences.
      <br /><br />
      This view is read-only. Procedural memories are created automatically
      when the system detects repeated patterns in your work.
    </div>
  );
}
