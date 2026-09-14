import { useCallback, useState } from 'react';

function readOrder<T extends string>(storageKey: string, defaultOrder: readonly T[]): T[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [...defaultOrder];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...defaultOrder];
    const known = new Set<string>(defaultOrder);
    const kept = parsed.filter((k): k is T => typeof k === 'string' && known.has(k));
    // Any keys added to `defaultOrder` since this was saved (a new widget)
    // are appended so they still show up for returning users.
    const missing = defaultOrder.filter((k) => !kept.includes(k));
    return [...kept, ...missing];
  } catch {
    return [...defaultOrder];
  }
}

function writeOrder<T extends string>(storageKey: string, order: T[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(order));
  } catch {
    /* ignore — falls back to in-memory order for this session */
  }
}

/**
 * Drag-to-reorder for a fixed set of widget keys, persisted per browser.
 * The drag gesture is split into a handle (draggable + dragstart/dragend)
 * and a drop zone (dragenter/dragover/drop) so callers can restrict the
 * actual drag trigger to a small grip while the whole card stays clickable.
 * `move` provides a non-drag fallback (arrow buttons) for touch/keyboard.
 */
export function useReorderable<T extends string>(storageKey: string, defaultOrder: readonly T[]) {
  const [order, setOrderState] = useState<T[]>(() => readOrder(storageKey, defaultOrder));
  const [draggedItem, setDraggedItem] = useState<T | null>(null);
  const [overItem, setOverItem] = useState<T | null>(null);

  const move = useCallback(
    (item: T, direction: -1 | 1) => {
      setOrderState((prev) => {
        const i = prev.indexOf(item);
        const j = i + direction;
        if (i < 0 || j < 0 || j >= prev.length) return prev;
        const next = prev.slice();
        [next[i], next[j]] = [next[j], next[i]];
        writeOrder(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  const reset = useCallback(() => {
    const next = [...defaultOrder];
    setOrderState(next);
    writeOrder(storageKey, next);
  }, [storageKey, defaultOrder]);

  const getHandleProps = useCallback(
    (item: T) => ({
      draggable: true as const,
      onDragStart: (e: React.DragEvent) => {
        setDraggedItem(item);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item);
      },
      onDragEnd: () => {
        setDraggedItem(null);
        setOverItem(null);
      },
    }),
    []
  );

  const getDropZoneProps = useCallback(
    (item: T) => ({
      onDragEnter: (e: React.DragEvent) => {
        e.preventDefault();
        if (draggedItem && draggedItem !== item) setOverItem(item);
      },
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (draggedItem && draggedItem !== item) {
          setOrderState((prev) => {
            const next = prev.filter((k) => k !== draggedItem);
            next.splice(next.indexOf(item), 0, draggedItem);
            writeOrder(storageKey, next);
            return next;
          });
        }
        setDraggedItem(null);
        setOverItem(null);
      },
    }),
    [draggedItem, storageKey]
  );

  return {
    order,
    move,
    reset,
    isDragging: (item: T) => draggedItem === item,
    isDragOver: (item: T) => overItem === item && draggedItem !== item,
    getHandleProps,
    getDropZoneProps,
  };
}
