import { invoke } from '@tauri-apps/api/core';
import type { WindowState } from '../types/window';

export async function createWindow(
  title: string,
  width?: number,
  height?: number,
  x?: number,
  y?: number,
  contentType?: string
): Promise<WindowState> {
  return invoke('create_window', {
    title,
    width: width ?? null,
    height: height ?? null,
    x: x ?? null,
    y: y ?? null,
    contentType: contentType ?? null,
  });
}

export async function closeWindow(id: string): Promise<void> {
  return invoke('close_window', { id });
}

export async function resizeWindow(id: string, width: number, height: number): Promise<WindowState> {
  return invoke('resize_window', { id, width, height });
}

export async function moveWindow(id: string, x: number, y: number): Promise<WindowState> {
  return invoke('move_window', { id, x, y });
}

export async function minimizeWindow(id: string): Promise<WindowState> {
  return invoke('minimize_window', { id });
}

export async function restoreWindow(id: string): Promise<WindowState> {
  return invoke('restore_window', { id });
}

export async function focusWindow(id: string): Promise<WindowState> {
  return invoke('focus_window', { id });
}

export async function getWindows(): Promise<WindowState[]> {
  return invoke('get_windows');
}
