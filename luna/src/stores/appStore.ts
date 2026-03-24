import { create } from 'zustand';
import type { AppDescriptor } from '../renderer/types';

interface AppState {
  /** app_id → descriptor */
  specs: Map<string, AppDescriptor>;
  /** app_id → live data context */
  data: Map<string, Record<string, any>>;
  /** app_id → window_id */
  appWindows: Map<string, string>;
}

interface AppActions {
  registerApp: (appId: string, spec: AppDescriptor, windowId: string) => void;
  updateAppData: (appId: string, data: Record<string, any>) => void;
  updateAppSpec: (appId: string, spec: AppDescriptor) => void;
  destroyApp: (appId: string) => void;
  getApp: (appId: string) => { spec: AppDescriptor; data: Record<string, any> } | undefined;
  getAppByWindowId: (windowId: string) => { appId: string; spec: AppDescriptor; data: Record<string, any> } | undefined;
}

export const useAppStore = create<AppState & AppActions>((set, get) => ({
  specs: new Map(),
  data: new Map(),
  appWindows: new Map(),

  registerApp: (appId, spec, windowId) => {
    set((state) => {
      const specs = new Map(state.specs);
      const data = new Map(state.data);
      const appWindows = new Map(state.appWindows);
      specs.set(appId, spec);
      data.set(appId, spec.data || {});
      appWindows.set(appId, windowId);
      return { specs, data, appWindows };
    });
  },

  updateAppData: (appId, newData) => {
    set((state) => {
      const data = new Map(state.data);
      const existing = data.get(appId) || {};
      data.set(appId, { ...existing, ...newData });
      return { data };
    });
  },

  updateAppSpec: (appId, spec) => {
    set((state) => {
      const specs = new Map(state.specs);
      specs.set(appId, spec);
      return { specs };
    });
  },

  destroyApp: (appId) => {
    set((state) => {
      const specs = new Map(state.specs);
      const data = new Map(state.data);
      const appWindows = new Map(state.appWindows);
      specs.delete(appId);
      data.delete(appId);
      appWindows.delete(appId);
      return { specs, data, appWindows };
    });
  },

  getApp: (appId) => {
    const state = get();
    const spec = state.specs.get(appId);
    if (!spec) return undefined;
    return { spec, data: state.data.get(appId) || {} };
  },

  getAppByWindowId: (windowId) => {
    const state = get();
    for (const [appId, wId] of state.appWindows.entries()) {
      if (wId === windowId) {
        const spec = state.specs.get(appId);
        if (spec) return { appId, spec, data: state.data.get(appId) || {} };
      }
    }
    return undefined;
  },
}));
