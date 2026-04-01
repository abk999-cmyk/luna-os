import { useState, useCallback, useRef, useEffect } from 'react';
import { getComponent } from './ComponentRegistry';
import { resolveDataBindings, writeBinding } from './dataBinding';
import { createEventHandler, dispatchAppEvent } from './eventBridge';
import { layoutToStyle } from '../components/primitives/types';
import type { AppDescriptor, ComponentSpec, LayoutSpec } from './types';

interface DynamicRendererProps {
  spec: AppDescriptor;
  dataContext: Record<string, any>;
  appId: string;
}

/** Recursively renders a component tree from a JSON app descriptor. */
export function DynamicRenderer({ spec, dataContext: initialData, appId }: DynamicRendererProps) {
  const [data, setData] = useState<Record<string, any>>(initialData);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update local state when external data changes
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  // Debounced sync to backend
  const syncToBackend = useCallback((newData: Record<string, any>) => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      dispatchAppEvent(appId, '__data_sync', '__context', newData);
    }, 500);
  }, [appId]);

  // Update data context and sync
  const updateData = useCallback((path: string, value: any) => {
    setData(prev => {
      const next = writeBinding(path, value, prev);
      syncToBackend(next);
      return next;
    });
  }, [syncToBackend]);

  const rootLayout: LayoutSpec =
    typeof spec.layout === 'string'
      ? { direction: spec.layout === 'horizontal' ? 'row' : 'column', gap: 12 }
      : spec.layout;

  return (
    <div
      className="luna-dynamic-app"
      style={{
        ...layoutToStyle(rootLayout),
        height: '100%',
        overflow: 'auto',
        ...(spec.styles || {}),
      }}
    >
      {spec.components.map((comp) => (
        <ComponentNode
          key={comp.id}
          spec={comp}
          dataContext={data}
          appId={appId}
          updateData={updateData}
        />
      ))}
    </div>
  );
}

interface ComponentNodeProps {
  spec: ComponentSpec;
  dataContext: Record<string, any>;
  appId: string;
  updateData: (path: string, value: any) => void;
}

/** Renders a single component from spec, recursing into children. */
function ComponentNode({ spec, dataContext, appId, updateData }: ComponentNodeProps) {
  const Component = getComponent(spec.type);

  if (!Component) {
    return (
      <div style={{ padding: 8, color: 'var(--color-error)', fontSize: '0.85em' }}>
        Unknown component: {spec.type}
      </div>
    );
  }

  // Resolve data bindings in props ($.field.path -> actual values)
  const resolvedProps = resolveDataBindings(spec.props || {}, dataContext);

  // Create event handler that bridges to Tauri IPC AND writes back bindings
  const baseOnEvent = createEventHandler(appId, spec.id, spec.events);

  const onEvent = (eventType: string, eventData: any) => {
    // Forward to backend event bridge
    baseOnEvent(eventType, eventData);

    // Write-back: if a prop was bound to $.path and this is a value-change event,
    // update the data context
    if (eventType === 'onChange' || eventType === 'onToggle' || eventType === 'onCheck') {
      const rawProps = spec.props || {};
      // Find which prop was a binding for value/checked/items
      for (const [key, val] of Object.entries(rawProps)) {
        if (typeof val === 'string' && val.startsWith('$.')) {
          const bindingPath = val.slice(2);
          // Match the event to the bound prop
          if (key === 'value' || key === 'checked' || key === 'items') {
            updateData(bindingPath, eventData);
            break;
          }
        }
      }
    }
  };

  // If this component has children specs, render them recursively
  const renderedChildren = spec.children && spec.children.length > 0
    ? spec.children.map((child) => (
        <ComponentNode
          key={child.id}
          spec={child}
          dataContext={dataContext}
          appId={appId}
          updateData={updateData}
        />
      ))
    : null;

  const layoutStyle = spec.layout ? layoutToStyle(spec.layout) : {};

  return (
    <div style={layoutStyle}>
      <Component
        id={spec.id}
        props={resolvedProps}
        onEvent={onEvent}
        layout={spec.layout}
      >
        {renderedChildren}
      </Component>
    </div>
  );
}
