import type { PrimitiveProps } from '../components/primitives/types';
import type { ComponentType } from 'react';
import {
  Container, Grid, Divider, Spacer,
  Panel, Card, DataTable, List,
  TextInput, NumberInput, Select, Checkbox, Toggle, Slider,
  Stat, Timeline, Tabs, Modal,
  Chat, Chart, Gauge, Breadcrumbs,
  CodeEditor, Terminal,
} from '../components/primitives';

type PrimitiveComponent = ComponentType<PrimitiveProps>;

const registry: Map<string, PrimitiveComponent> = new Map();

/** Register a component type for use in dynamic app rendering. */
export function registerComponent(type: string, component: PrimitiveComponent) {
  registry.set(type, component);
}

/** Look up a component by its type string. */
export function getComponent(type: string): PrimitiveComponent | undefined {
  return registry.get(type);
}

/** Get all registered component type names. */
export function getRegisteredTypes(): string[] {
  return Array.from(registry.keys());
}

/** Register all built-in primitives. Call once at app startup. */
export function registerBuiltinComponents() {
  registerComponent('Container', Container);
  registerComponent('Grid', Grid);
  registerComponent('Divider', Divider);
  registerComponent('Spacer', Spacer);
  registerComponent('Panel', Panel);
  registerComponent('Card', Card);
  registerComponent('DataTable', DataTable);
  registerComponent('List', List);
  registerComponent('TextInput', TextInput);
  registerComponent('NumberInput', NumberInput);
  registerComponent('Select', Select);
  registerComponent('Checkbox', Checkbox);
  registerComponent('Toggle', Toggle);
  registerComponent('Slider', Slider);
  registerComponent('Stat', Stat);
  registerComponent('Timeline', Timeline);
  registerComponent('Tabs', Tabs);
  registerComponent('Modal', Modal);
  registerComponent('Chat', Chat);
  registerComponent('Chart', Chart);
  registerComponent('Gauge', Gauge);
  registerComponent('Breadcrumbs', Breadcrumbs);
  registerComponent('CodeEditor', CodeEditor);
  registerComponent('Terminal', Terminal);
}
