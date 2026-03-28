import { useState, useEffect, useRef, useCallback } from 'react';
import { useActivityStore, type ActivityType } from '../stores/activityStore';
import { ActionCard } from './ActionCard';

const FILTER_TYPES: { label: string; value: ActivityType | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Files', value: 'file' },
  { label: 'Shell', value: 'shell' },
  { label: 'Windows', value: 'window' },
  { label: 'Memory', value: 'memory' },
  { label: 'Agent', value: 'agent' },
];

export function ActivityFeed() {
  const events = useActivityStore((s) => s.events);
  const [filter, setFilter] = useState<ActivityType | 'all'>('all');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const filtered = filter === 'all' ? events : events.filter((e) => e.type === filter);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  }, []);

  return (
    <div className="activity-feed">
      {/* Filter bar */}
      <div className="activity-feed__filters">
        {FILTER_TYPES.map((f) => (
          <button
            key={f.value}
            className={`activity-feed__filter ${filter === f.value ? 'activity-feed__filter--active' : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Event list */}
      <div className="activity-feed__list" ref={scrollRef} onScroll={handleScroll}>
        {filtered.length === 0 && (
          <div className="activity-feed__empty">
            No activity yet. Send a message to start.
          </div>
        )}
        {filtered.map((event) => (
          <ActionCard key={event.id} event={event} compact />
        ))}
      </div>

      {/* Summary */}
      {events.length > 0 && (
        <div className="activity-feed__summary">
          {events.length} events
          {filter !== 'all' && ` · ${filtered.length} ${filter}`}
        </div>
      )}
    </div>
  );
}
