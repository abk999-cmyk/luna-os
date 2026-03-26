/** Layout specification for component positioning within a flex/grid container. */
export interface LayoutSpec {
  direction?: 'row' | 'column';
  gap?: number;
  grow?: number;
  shrink?: number;
  basis?: string;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around';
  wrap?: boolean;
  padding?: number | string;
}

/** A single component descriptor within an app spec. */
export interface ComponentSpec {
  id: string;
  type: string;
  props: Record<string, any>;
  children?: ComponentSpec[];
  events?: Record<string, string>;
  layout?: LayoutSpec;
}

/** Props passed to every primitive component. */
export interface PrimitiveProps {
  id: string;
  props: Record<string, any>;
  onEvent: (eventType: string, data: any) => void;
  children?: React.ReactNode;
  layout?: LayoutSpec;
}

/** Convert LayoutSpec to inline CSS style object. */
export function layoutToStyle(layout?: LayoutSpec): React.CSSProperties {
  if (!layout) return {};
  const style: React.CSSProperties = {
    display: 'flex',
    flexDirection: layout.direction === 'row' ? 'row' : 'column',
  };
  if (layout.gap !== undefined) style.gap = `${layout.gap}px`;
  if (layout.grow !== undefined) style.flexGrow = layout.grow;
  if (layout.shrink !== undefined) style.flexShrink = layout.shrink;
  if (layout.basis) style.flexBasis = layout.basis;
  if (layout.wrap) style.flexWrap = 'wrap';
  if (layout.padding !== undefined) {
    style.padding = typeof layout.padding === 'number' ? `${layout.padding}px` : layout.padding;
  }
  if (layout.align) {
    const map: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' };
    style.alignItems = map[layout.align] as any;
  }
  if (layout.justify) {
    const map: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', 'space-between': 'space-between', 'space-around': 'space-around' };
    style.justifyContent = map[layout.justify] as any;
  }
  return style;
}
