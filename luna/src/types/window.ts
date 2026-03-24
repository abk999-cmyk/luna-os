export interface WindowState {
  id: string;
  title: string;
  bounds: Bounds;
  z_order: number;
  visibility: 'visible' | 'minimized' | 'hidden';
  focused: boolean;
  content_type: 'response' | 'editor' | 'panel' | 'canvas' | 'empty';
  created_at: string;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
