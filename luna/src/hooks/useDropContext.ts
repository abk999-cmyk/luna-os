import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { parseFile, generateContextSummary } from '../services/contextParser';

interface UseDropContextReturn {
  isDropTarget: boolean;
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
}

/** Hook for handling file drag-and-drop context injection. */
export function useDropContext(): UseDropContextReturn {
  const [isDropTarget, setIsDropTarget] = useState(false);
  const dragCountRef = useRef(0);

  // M7: Increment counter on dragEnter (fires once per element boundary),
  // not dragOver (fires continuously)
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current++;
    setIsDropTarget(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current--;
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0;
      setIsDropTarget(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropTarget(false);
    dragCountRef.current = 0;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    for (const file of files) {
      try {
        const parsed = await parseFile(file);
        const summary = generateContextSummary(parsed);

        await invoke('inject_context', {
          contextType: parsed.type,
          summary,
          content: parsed.content,
          sourceFilename: file.name,
        });
      } catch (err) {
        console.error('Failed to inject context from file:', file.name, err);
      }
    }
  }, []);

  return { isDropTarget, handleDragEnter, handleDragOver, handleDragLeave, handleDrop };
}
