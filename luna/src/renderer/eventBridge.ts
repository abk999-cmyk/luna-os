import { invoke } from '@tauri-apps/api/core';

/**
 * Routes component events from the dynamic renderer to the backend agent system.
 *
 * When a component fires an event (e.g., onRowSelect), the eventBridge:
 * 1. Looks up the handler name from the component's events map
 * 2. Dispatches it to the backend via Tauri IPC
 * 3. The backend routes it to the controlling agent
 */
export async function dispatchAppEvent(
  appId: string,
  handlerName: string,
  componentId: string,
  eventData: any
) {
  try {
    await invoke('dispatch_app_event', {
      appId,
      handlerName,
      componentId,
      eventData: JSON.stringify(eventData),
    });
  } catch (e) {
    console.warn(`[eventBridge] Failed to dispatch event ${handlerName} for app ${appId}:`, e);
  }
}

/**
 * Create an onEvent handler function for a specific app and component.
 * This is the bridge between React component events and Tauri IPC.
 */
export function createEventHandler(
  appId: string,
  componentId: string,
  eventsMap: Record<string, string> | undefined
) {
  return (eventType: string, data: any) => {
    // Look up the handler name from the events map
    const handlerName = eventsMap?.[eventType];
    if (handlerName) {
      dispatchAppEvent(appId, handlerName, componentId, data);
    }
  };
}
