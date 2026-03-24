import { getComponent } from './ComponentRegistry';
import { resolveDataBindings } from './dataBinding';
import { createEventHandler } from './eventBridge';
import { layoutToStyle } from '../components/primitives/types';
import type { AppDescriptor, ComponentSpec, LayoutSpec } from './types';

interface DynamicRendererProps {
  spec: AppDescriptor;
  dataContext: Record<string, any>;
  appId: string;
}

/** Recursively renders a component tree from a JSON app descriptor. */
export function DynamicRenderer({ spec, dataContext, appId }: DynamicRendererProps) {
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
      }}
    >
      {spec.components.map((comp) => (
        <ComponentNode
          key={comp.id}
          spec={comp}
          dataContext={dataContext}
          appId={appId}
        />
      ))}
    </div>
  );
}

interface ComponentNodeProps {
  spec: ComponentSpec;
  dataContext: Record<string, any>;
  appId: string;
}

/** Renders a single component from spec, recursing into children. */
function ComponentNode({ spec, dataContext, appId }: ComponentNodeProps) {
  const Component = getComponent(spec.type);

  if (!Component) {
    return (
      <div style={{ padding: 8, color: 'var(--color-error)', fontSize: '0.85em' }}>
        Unknown component: {spec.type}
      </div>
    );
  }

  // Resolve data bindings in props ($.field.path → actual values)
  const resolvedProps = resolveDataBindings(spec.props || {}, dataContext);

  // Create event handler that bridges to Tauri IPC
  const onEvent = createEventHandler(appId, spec.id, spec.events);

  // If this component has children specs, render them recursively
  // and pass as a React children prop
  if (spec.children && spec.children.length > 0) {
    const renderedChildren = spec.children.map((child) => (
      <ComponentNode
        key={child.id}
        spec={child}
        dataContext={dataContext}
        appId={appId}
      />
    ));

    resolvedProps.children = renderedChildren;
  }

  const layoutStyle = spec.layout ? layoutToStyle(spec.layout) : {};

  return (
    <div style={layoutStyle}>
      <Component
        id={spec.id}
        props={resolvedProps}
        onEvent={onEvent}
        children={spec.children}
        layout={spec.layout}
      />
    </div>
  );
}
