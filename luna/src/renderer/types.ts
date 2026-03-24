import type { ComponentSpec, LayoutSpec } from '../components/primitives/types';

/** Dynamic action definition declared by an app. */
export interface DynamicActionDef {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string }>;
  persistence: 'ephemeral' | 'persistent';
}

/** Top-level descriptor for a dynamic app emitted by the LLM. */
export interface AppDescriptor {
  version: string;
  type: 'application' | 'widget';
  id: string;
  title: string;
  description?: string;
  layout: 'vertical' | 'horizontal' | LayoutSpec;
  width?: number;
  height?: number;
  components: ComponentSpec[];
  actions?: DynamicActionDef[];
  styles?: Record<string, any>;
  data?: Record<string, any>;
}

/** Runtime state for a running dynamic app. */
export interface RunningApp {
  descriptor: AppDescriptor;
  dataContext: Record<string, any>;
  windowId: string;
  controllingAgentId: string;
  createdAt: number;
}

export type { ComponentSpec, LayoutSpec };
