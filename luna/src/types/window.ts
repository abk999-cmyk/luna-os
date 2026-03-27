export interface WindowState {
  id: string;
  title: string;
  bounds: Bounds;
  z_order: number;
  visibility: 'visible' | 'minimized' | 'hidden';
  focused: boolean;
  content_type: string; // 'editor' | 'spreadsheet' | 'slides' | 'email' | 'calendar' | 'file_manager' | 'kanban' | 'notes' | 'calculator' | 'browser' | 'music' | 'code_editor' | 'terminal' | 'canvas' | 'scratchpad' | 'response' | 'panel' | 'dynamic_app' | 'empty';
  created_at: string;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
