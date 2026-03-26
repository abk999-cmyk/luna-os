import { useState } from 'react';
import { PrimitiveProps } from './types';
import '../../styles/primitives/containers.css';

interface Tab {
  id: string;
  label: string;
  content?: string;
}

/** Tabbed content panel. */
export function Tabs({ id, props, onEvent, children }: PrimitiveProps) {
  const tabs: Tab[] = props.tabs || [];
  const [activeTab, setActiveTab] = useState(props.defaultTab || tabs[0]?.id || '');

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    onEvent('onTabChange', { tabId });
  };

  const active = tabs.find(t => t.id === activeTab);

  return (
    <div className="luna-tabs" id={id}>
      <div className="luna-tabs__header" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`luna-tabs__tab ${tab.id === activeTab ? 'luna-tabs__tab--active' : ''}`}
            role="tab"
            aria-selected={tab.id === activeTab}
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="luna-tabs__content" role="tabpanel">
        {children || active?.content || props.children}
      </div>
    </div>
  );
}
