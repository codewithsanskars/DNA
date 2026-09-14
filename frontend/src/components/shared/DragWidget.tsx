import { ReactNode, useRef } from 'react';
import Icon from './Icon';

interface DragHandleProps {
  draggable: true;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

interface DropZoneProps {
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

interface DragWidgetProps {
  /** Used in the reorder controls' accessible labels. */
  label: string;
  /** 'row' shows left/right arrows; 'column' shows up/down. */
  orientation?: 'row' | 'column';
  /** Shows the reorder toolbar (arrows + grip) and accepts drops. Off by default so cards stay plain until "Edit layout" is on. */
  editable?: boolean;
  handleProps: DragHandleProps;
  dropZoneProps: DropZoneProps;
  isDragging: boolean;
  isDragOver: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMoveBack: () => void;
  onMoveForward: () => void;
  className?: string;
  children: ReactNode;
}

const CONTROL_BUTTON =
  'pointer-events-auto flex h-6 w-6 items-center justify-center rounded border border-border-strong bg-card text-muted-foreground shadow-xs transition-colors hover:border-border-strong hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30';

export default function DragWidget({
  label,
  orientation = 'row',
  editable = false,
  handleProps,
  dropZoneProps,
  isDragging,
  isDragOver,
  isFirst,
  isLast,
  onMoveBack,
  onMoveForward,
  className = '',
  children,
}: DragWidgetProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const backIcon = orientation === 'row' ? 'arrow-left' : 'chevron-down';
  const forwardIcon = orientation === 'row' ? 'arrow-right' : 'chevron-down';

  const handleDragStart = (e: React.DragEvent) => {
    // Only the grip triggers the drag, but show the whole card as the drag
    // image so it doesn't look like just the 12px icon is being moved.
    if (rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect();
      e.dataTransfer.setDragImage(rootRef.current, e.clientX - rect.left, e.clientY - rect.top);
    }
    handleProps.onDragStart(e);
  };

  return (
    <div
      ref={rootRef}
      {...(editable ? dropZoneProps : {})}
      className={`group/widget relative rounded-lg transition-[opacity,box-shadow] duration-150 ${
        isDragging ? 'opacity-40' : ''
      } ${isDragOver ? 'ring-2 ring-brand ring-offset-2 ring-offset-background' : ''} ${className}`}
    >
      {editable && (
        <div className="absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5">
          <button
            type="button"
            aria-label={`Move ${label} earlier`}
            onClick={onMoveBack}
            disabled={isFirst}
            className={CONTROL_BUTTON}
          >
            <Icon name={backIcon} size={12} className={orientation === 'column' ? 'rotate-180' : ''} />
          </button>
          <button
            type="button"
            aria-label={`Move ${label} later`}
            onClick={onMoveForward}
            disabled={isLast}
            className={CONTROL_BUTTON}
          >
            <Icon name={forwardIcon} size={12} />
          </button>
          <button
            type="button"
            aria-label={`Drag to reorder ${label}`}
            title="Drag to reorder"
            draggable={handleProps.draggable}
            onDragStart={handleDragStart}
            onDragEnd={handleProps.onDragEnd}
            className={`${CONTROL_BUTTON} cursor-grab active:cursor-grabbing`}
          >
            <Icon name="grip" size={12} />
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
