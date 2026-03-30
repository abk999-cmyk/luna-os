import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { GLASS } from './glassStyles';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SlideElement {
  id: string;
  type: 'text' | 'heading' | 'subtitle' | 'bullet-list' | 'image' | 'shape';
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style?: Record<string, string>;
}

export interface SlideData {
  id: string;
  template: 'title' | 'content' | 'two-column' | 'blank';
  elements: SlideElement[];
  notes?: string;
  background?: string;
}

export interface SlidesAppProps {
  slides?: SlideData[];
  currentSlide?: number;
  onChange?: (slides: SlideData[]) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _uid = 0;
function uid(): string {
  return `el-${Date.now()}-${++_uid}`;
}

function slideUid(): string {
  return `slide-${Date.now()}-${++_uid}`;
}

function createDefaultSlide(template: SlideData['template']): SlideData {
  const id = slideUid();
  const elements: SlideElement[] = [];

  switch (template) {
    case 'title':
      elements.push(
        {
          id: uid(),
          type: 'heading',
          content: 'Presentation Title',
          x: 10,
          y: 30,
          width: 80,
          height: 15,
          style: { fontSize: '42px', fontWeight: '700', textAlign: 'center', color: '#1a1a2e' },
        },
        {
          id: uid(),
          type: 'subtitle',
          content: 'Subtitle goes here',
          x: 20,
          y: 52,
          width: 60,
          height: 10,
          style: { fontSize: '24px', fontWeight: '400', textAlign: 'center', color: '#555' },
        },
      );
      break;
    case 'content':
      elements.push(
        {
          id: uid(),
          type: 'heading',
          content: 'Slide Title',
          x: 5,
          y: 5,
          width: 90,
          height: 12,
          style: { fontSize: '32px', fontWeight: '700', color: '#1a1a2e' },
        },
        {
          id: uid(),
          type: 'text',
          content: 'Body text goes here. Click to edit.',
          x: 5,
          y: 22,
          width: 90,
          height: 60,
          style: { fontSize: '18px', color: '#333' },
        },
      );
      break;
    case 'two-column':
      elements.push(
        {
          id: uid(),
          type: 'heading',
          content: 'Two Column Layout',
          x: 5,
          y: 5,
          width: 90,
          height: 12,
          style: { fontSize: '32px', fontWeight: '700', color: '#1a1a2e' },
        },
        {
          id: uid(),
          type: 'text',
          content: 'Left column content',
          x: 5,
          y: 22,
          width: 42,
          height: 60,
          style: { fontSize: '18px', color: '#333' },
        },
        {
          id: uid(),
          type: 'text',
          content: 'Right column content',
          x: 53,
          y: 22,
          width: 42,
          height: 60,
          style: { fontSize: '18px', color: '#333' },
        },
      );
      break;
    case 'blank':
      break;
  }

  return { id, template, elements, notes: '', background: '#ffffff' };
}

const TEMPLATE_OPTIONS: { value: SlideData['template']; label: string }[] = [
  { value: 'title', label: 'Title Slide' },
  { value: 'content', label: 'Title + Content' },
  { value: 'two-column', label: 'Two Column' },
  { value: 'blank', label: 'Blank' },
];

const SHAPE_PRESETS: { label: string; shape: string }[] = [
  { label: 'Rect', shape: 'rectangle' },
  { label: 'Circle', shape: 'ellipse' },
  { label: 'Arrow', shape: 'arrow-right' },
];

// ─── CSS-in-JS Styles ───────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    background: 'transparent',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-ui)',
    fontSize: '13px',
    overflow: 'hidden',
    userSelect: 'none',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    padding: '4px 8px',
    ...GLASS.elevated,
    borderBottom: `1px solid ${GLASS.dividerColor}`,
    flexShrink: 0,
    flexWrap: 'wrap',
    minHeight: '36px',
  },
  toolbarGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    padding: '0 4px',
  },
  toolbarDivider: {
    width: '1px',
    height: '20px',
    background: GLASS.dividerColor,
    margin: '0 4px',
  },
  btn: {
    ...GLASS.ghostBtn,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '28px',
    minWidth: '28px',
    padding: '0 6px',
    fontSize: '12px',
    whiteSpace: 'nowrap' as const,
  },
  btnActive: {
    background: GLASS.selectedBg,
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  slidePanel: {
    width: '160px',
    minWidth: '160px',
    ...GLASS.elevated,
    borderRight: `1px solid ${GLASS.dividerColor}`,
    overflowY: 'auto' as const,
    padding: '8px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  thumbnail: {
    width: '100%',
    aspectRatio: '16/9',
    borderRadius: '4px',
    border: '2px solid transparent',
    overflow: 'hidden',
    cursor: 'pointer',
    position: 'relative' as const,
    background: '#fff',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    flexShrink: 0,
  },
  thumbnailSelected: {
    borderColor: 'var(--accent-primary)',
    boxShadow: `0 0 0 1px var(--accent-primary)`,
  },
  thumbnailLabel: {
    position: 'absolute' as const,
    bottom: '2px',
    left: '4px',
    fontSize: '9px',
    color: '#888',
    pointerEvents: 'none' as const,
  },
  mainArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  canvasWrapper: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    overflow: 'hidden',
    background: 'rgba(0,0,0,0.15)',
    position: 'relative' as const,
  },
  canvas: {
    position: 'relative' as const,
    width: '100%',
    maxWidth: '960px',
    aspectRatio: '16/9',
    borderRadius: '4px',
    overflow: 'hidden',
    boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
    transition: 'opacity 0.25s ease-in-out',
  },
  notesArea: {
    height: '80px',
    minHeight: '60px',
    ...GLASS.elevated,
    borderTop: `1px solid ${GLASS.dividerColor}`,
    padding: '6px 12px',
    display: 'flex',
    flexDirection: 'column' as const,
    flexShrink: 0,
  },
  notesLabel: {
    fontSize: '10px',
    color: 'var(--text-tertiary)',
    marginBottom: '2px',
    fontWeight: 600,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
  },
  notesInput: {
    flex: 1,
    resize: 'none' as const,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-ui)',
    fontSize: '12px',
    lineHeight: '1.4',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 12px',
    ...GLASS.elevated,
    borderTop: `1px solid ${GLASS.dividerColor}`,
    fontSize: '11px',
    color: 'var(--text-tertiary)',
    flexShrink: 0,
    minHeight: '28px',
  },
  presentOverlay: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 99999,
    background: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'none',
  },
  presentSlide: {
    width: '100vw',
    height: '100vh',
    position: 'relative' as const,
    overflow: 'hidden',
    transition: 'opacity 0.35s ease-in-out',
  },
  dropdownMenu: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    marginTop: '2px',
    ...GLASS.elevated,
    borderRadius: '6px',
    padding: '4px 0',
    zIndex: 100,
    minWidth: '140px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  },
  dropdownItem: {
    display: 'block',
    width: '100%',
    padding: '6px 12px',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-primary)',
    fontSize: '12px',
    textAlign: 'left' as const,
    cursor: 'pointer',
  },
  select: {
    ...GLASS.inset,
    height: '28px',
    padding: '0 6px',
    fontSize: '12px',
    cursor: 'pointer',
  },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

interface ToolbarButtonProps {
  label: string;
  title?: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}

function ToolbarButton({ label, title, active, onClick, disabled }: ToolbarButtonProps) {
  const [hover, setHover] = useState(false);
  return (
    <button
      style={{
        ...styles.btn,
        ...(active ? styles.btnActive : {}),
        ...(hover && !disabled ? { background: GLASS.hoverBg } : {}),
        ...(disabled ? { opacity: 0.4, cursor: 'default' } : {}),
      }}
      title={title ?? label}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {label}
    </button>
  );
}

// ─── Slide Element Renderer ──────────────────────────────────────────────────

interface SlideElementViewProps {
  element: SlideElement;
  isEditing: boolean;
  isSelected: boolean;
  scale: number;
  onSelect: () => void;
  onEdit: () => void;
  onContentChange: (content: string) => void;
  onStopEdit: () => void;
}

function SlideElementView({
  element,
  isEditing,
  isSelected,
  scale,
  onSelect,
  onEdit,
  onContentChange,
  onStopEdit,
}: SlideElementViewProps) {
  const editRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      // Place cursor at end
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [isEditing]);

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${element.x}%`,
    top: `${element.y}%`,
    width: `${element.width}%`,
    height: `${element.height}%`,
    outline: isSelected ? '2px solid #4a90d9' : 'none',
    outlineOffset: '1px',
    borderRadius: '2px',
    cursor: isEditing ? 'text' : 'pointer',
    overflow: 'hidden',
    boxSizing: 'border-box' as const,
    ...element.style,
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit();
  };

  const handleBlur = () => {
    if (editRef.current) {
      onContentChange(editRef.current.innerText);
    }
    onStopEdit();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleBlur();
    }
    // Prevent event bubbling for text editing keys
    e.stopPropagation();
  };

  // Shape rendering
  if (element.type === 'shape') {
    const shapeColor = element.style?.backgroundColor || '#4a90d9';
    let shapeContent: React.ReactNode = null;

    if (element.content === 'ellipse') {
      shapeContent = (
        <div
          style={{
            ...baseStyle,
            borderRadius: '50%',
            backgroundColor: shapeColor,
          }}
          onClick={handleClick}
        />
      );
    } else if (element.content === 'arrow-right') {
      shapeContent = (
        <div style={baseStyle} onClick={handleClick}>
          <svg viewBox="0 0 100 60" width="100%" height="100%" preserveAspectRatio="none">
            <polygon points="0,15 70,15 70,0 100,30 70,60 70,45 0,45" fill={shapeColor} />
          </svg>
        </div>
      );
    } else {
      // rectangle
      shapeContent = (
        <div
          style={{
            ...baseStyle,
            backgroundColor: shapeColor,
            borderRadius: '4px',
          }}
          onClick={handleClick}
        />
      );
    }
    return shapeContent;
  }

  // Image rendering
  if (element.type === 'image') {
    return (
      <div style={baseStyle} onClick={handleClick} onDoubleClick={handleDoubleClick}>
        {element.content ? (
          <img
            src={element.content}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            draggable={false}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#f0f0f0',
              color: '#999',
              fontSize: `${Math.max(10, 14 * scale)}px`,
            }}
          >
            Image URL
          </div>
        )}
      </div>
    );
  }

  // Bullet list
  if (element.type === 'bullet-list') {
    const items = element.content.split('\n').filter(Boolean);
    if (isEditing) {
      return (
        <div
          ref={editRef}
          style={{
            ...baseStyle,
            whiteSpace: 'pre-wrap',
            padding: '4px 4px 4px 20px',
          }}
          contentEditable
          suppressContentEditableWarning
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onClick={handleClick}
        >
          {element.content}
        </div>
      );
    }
    return (
      <div style={baseStyle} onClick={handleClick} onDoubleClick={handleDoubleClick}>
        <ul style={{ margin: 0, padding: '0 0 0 20px', listStyleType: 'disc' }}>
          {items.map((item, i) => (
            <li key={i} style={{ marginBottom: '4px' }}>
              {item}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Text-based elements (heading, subtitle, text)
  return (
    <div
      ref={isEditing ? editRef : undefined}
      style={{
        ...baseStyle,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        padding: '2px 4px',
      }}
      contentEditable={isEditing}
      suppressContentEditableWarning
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onBlur={isEditing ? handleBlur : undefined}
      onKeyDown={isEditing ? handleKeyDown : undefined}
    >
      {element.content}
    </div>
  );
}

// ─── Thumbnail renderer ─────────────────────────────────────────────────────

function SlideThumbnail({ slide }: { slide: SlideData }) {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      {slide.elements.map((el) => {
        const elStyle: React.CSSProperties = {
          position: 'absolute',
          left: `${el.x}%`,
          top: `${el.y}%`,
          width: `${el.width}%`,
          height: `${el.height}%`,
          fontSize: '3px',
          lineHeight: '1.2',
          overflow: 'hidden',
          color: el.style?.color || '#333',
          fontWeight: el.style?.fontWeight as any,
          textAlign: el.style?.textAlign as any,
        };

        if (el.type === 'shape') {
          const shapeColor = el.style?.backgroundColor || '#4a90d9';
          return (
            <div
              key={el.id}
              style={{
                ...elStyle,
                backgroundColor: shapeColor,
                borderRadius: el.content === 'ellipse' ? '50%' : '2px',
              }}
            />
          );
        }

        if (el.type === 'image') {
          return (
            <div
              key={el.id}
              style={{ ...elStyle, background: '#e0e0e0' }}
            />
          );
        }

        return (
          <div key={el.id} style={elStyle}>
            {el.content.slice(0, 30)}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SlidesApp({ slides: controlledSlides, currentSlide: controlledCurrent, onChange }: SlidesAppProps) {
  // External prop sync refs
  const isInternalEdit = useRef(false);
  const lastExternalSlides = useRef<string>(JSON.stringify(controlledSlides));

  // State
  const [internalSlides, setInternalSlides] = useState<SlideData[]>(() =>
    controlledSlides && controlledSlides.length > 0
      ? controlledSlides
      : [createDefaultSlide('title'), createDefaultSlide('content')],
  );
  const [currentIndex, setCurrentIndex] = useState(controlledCurrent ?? 0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [presentTransition, setPresentTransition] = useState(1);
  const [canvasTransition, setCanvasTransition] = useState(1);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const shapeMenuRef = useRef<HTMLDivElement>(null);

  // Sync controlled props
  const slides = controlledSlides ?? internalSlides;

  // Sync external slide changes
  useEffect(() => {
    const serialized = JSON.stringify(controlledSlides);
    if (serialized === lastExternalSlides.current) return;
    if (isInternalEdit.current) {
      isInternalEdit.current = false;
      return;
    }
    lastExternalSlides.current = serialized;
    if (controlledSlides && controlledSlides.length > 0) {
      setInternalSlides(controlledSlides);
    }
  }, [controlledSlides]);

  const updateSlides = useCallback(
    (next: SlideData[] | ((prev: SlideData[]) => SlideData[])) => {
      isInternalEdit.current = true;
      const resolved = typeof next === 'function' ? next(slides) : next;
      if (!controlledSlides) setInternalSlides(resolved);
      onChange?.(resolved);
    },
    [slides, controlledSlides, onChange],
  );

  useEffect(() => {
    if (controlledCurrent !== undefined) setCurrentIndex(controlledCurrent);
  }, [controlledCurrent]);

  // Ensure valid index
  const safeIndex = Math.max(0, Math.min(currentIndex, slides.length - 1));
  const currentSlideData = slides[safeIndex];

  // Canvas scale for element interaction
  const [canvasScale, setCanvasScale] = useState(1);
  useEffect(() => {
    if (!canvasRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasScale(entry.contentRect.width / 960);
      }
    });
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, []);

  // Close menus on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (addMenuOpen && addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
      if (shapeMenuOpen && shapeMenuRef.current && !shapeMenuRef.current.contains(e.target as Node)) {
        setShapeMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [addMenuOpen, shapeMenuOpen]);

  // ─── Slide navigation with transition ────────────────────────────────────

  const goToSlide = useCallback(
    (index: number) => {
      if (index === safeIndex || index < 0 || index >= slides.length) return;
      setCanvasTransition(0);
      setSelectedElementId(null);
      setEditingElementId(null);
      setTimeout(() => {
        setCurrentIndex(index);
        requestAnimationFrame(() => setCanvasTransition(1));
      }, 120);
    },
    [safeIndex, slides.length],
  );

  // ─── Slide operations ────────────────────────────────────────────────────

  const addSlide = useCallback(
    (template: SlideData['template']) => {
      const newSlide = createDefaultSlide(template);
      updateSlides((prev) => {
        const next = [...prev];
        next.splice(safeIndex + 1, 0, newSlide);
        return next;
      });
      setTimeout(() => goToSlide(safeIndex + 1), 30);
      // Use setTimeout to let updateSlides propagate before navigating
      setTimeout(() => setCurrentIndex(safeIndex + 1), 50);
      setAddMenuOpen(false);
    },
    [safeIndex, updateSlides, goToSlide],
  );

  const deleteSlide = useCallback(() => {
    if (slides.length <= 1) return;
    updateSlides((prev) => prev.filter((_, i) => i !== safeIndex));
    setCurrentIndex(Math.max(0, safeIndex - 1));
    setSelectedElementId(null);
    setEditingElementId(null);
  }, [slides.length, safeIndex, updateSlides]);

  const duplicateSlide = useCallback(() => {
    const dupe: SlideData = {
      ...currentSlideData,
      id: slideUid(),
      elements: currentSlideData.elements.map((el) => ({ ...el, id: uid() })),
    };
    updateSlides((prev) => {
      const next = [...prev];
      next.splice(safeIndex + 1, 0, dupe);
      return next;
    });
    setTimeout(() => setCurrentIndex(safeIndex + 1), 50);
  }, [currentSlideData, safeIndex, updateSlides]);

  // ─── Element operations ──────────────────────────────────────────────────

  const updateElement = useCallback(
    (elementId: string, updates: Partial<SlideElement>) => {
      updateSlides((prev) =>
        prev.map((slide, i) =>
          i === safeIndex
            ? {
                ...slide,
                elements: slide.elements.map((el) =>
                  el.id === elementId ? { ...el, ...updates } : el,
                ),
              }
            : slide,
        ),
      );
    },
    [safeIndex, updateSlides],
  );

  const addElement = useCallback(
    (type: SlideElement['type'], content: string = '') => {
      const newEl: SlideElement = {
        id: uid(),
        type,
        content:
          content ||
          (type === 'heading'
            ? 'New Heading'
            : type === 'subtitle'
            ? 'New Subtitle'
            : type === 'bullet-list'
            ? 'Item 1\nItem 2\nItem 3'
            : type === 'image'
            ? ''
            : 'New text'),
        x: 10,
        y: 40,
        width: type === 'shape' ? 15 : 40,
        height: type === 'shape' ? 20 : 15,
        style:
          type === 'heading'
            ? { fontSize: '32px', fontWeight: '700', color: '#1a1a2e' }
            : type === 'subtitle'
            ? { fontSize: '24px', fontWeight: '400', color: '#555' }
            : type === 'shape'
            ? { backgroundColor: '#4a90d9' }
            : { fontSize: '18px', color: '#333' },
      };
      updateSlides((prev) =>
        prev.map((slide, i) =>
          i === safeIndex ? { ...slide, elements: [...slide.elements, newEl] } : slide,
        ),
      );
      setSelectedElementId(newEl.id);
    },
    [safeIndex, updateSlides],
  );

  const deleteSelectedElement = useCallback(() => {
    if (!selectedElementId) return;
    updateSlides((prev) =>
      prev.map((slide, i) =>
        i === safeIndex
          ? { ...slide, elements: slide.elements.filter((el) => el.id !== selectedElementId) }
          : slide,
      ),
    );
    setSelectedElementId(null);
    setEditingElementId(null);
  }, [selectedElementId, safeIndex, updateSlides]);

  // ─── Text formatting ─────────────────────────────────────────────────────

  const selectedElement = useMemo(
    () => currentSlideData?.elements.find((el) => el.id === selectedElementId),
    [currentSlideData, selectedElementId],
  );

  const toggleStyle = useCallback(
    (prop: string, onVal: string, offVal: string) => {
      if (!selectedElementId || !selectedElement) return;
      const current = selectedElement.style?.[prop];
      updateElement(selectedElementId, {
        style: { ...selectedElement.style, [prop]: current === onVal ? offVal : onVal },
      });
    },
    [selectedElementId, selectedElement, updateElement],
  );

  const setAlignment = useCallback(
    (align: string) => {
      if (!selectedElementId || !selectedElement) return;
      updateElement(selectedElementId, {
        style: { ...selectedElement.style, textAlign: align },
      });
    },
    [selectedElementId, selectedElement, updateElement],
  );

  const changeFontSize = useCallback(
    (delta: number) => {
      if (!selectedElementId || !selectedElement) return;
      const current = parseInt(selectedElement.style?.fontSize || '18', 10);
      const next = Math.max(8, Math.min(120, current + delta));
      updateElement(selectedElementId, {
        style: { ...selectedElement.style, fontSize: `${next}px` },
      });
    },
    [selectedElementId, selectedElement, updateElement],
  );

  // ─── Notes ────────────────────────────────────────────────────────────────

  const updateNotes = useCallback(
    (notes: string) => {
      updateSlides((prev) =>
        prev.map((slide, i) => (i === safeIndex ? { ...slide, notes } : slide)),
      );
    },
    [safeIndex, updateSlides],
  );

  // ─── Present mode ─────────────────────────────────────────────────────────

  const [presentIndex, setPresentIndex] = useState(0);

  const startPresenting = useCallback(() => {
    setPresentIndex(safeIndex);
    setPresentTransition(1);
    setPresenting(true);
  }, [safeIndex]);

  const stopPresenting = useCallback(() => {
    setPresenting(false);
  }, []);

  const presentNext = useCallback(() => {
    if (presentIndex >= slides.length - 1) return;
    setPresentTransition(0);
    setTimeout(() => {
      setPresentIndex((i) => i + 1);
      requestAnimationFrame(() => setPresentTransition(1));
    }, 150);
  }, [presentIndex, slides.length]);

  const presentPrev = useCallback(() => {
    if (presentIndex <= 0) return;
    setPresentTransition(0);
    setTimeout(() => {
      setPresentIndex((i) => i - 1);
      requestAnimationFrame(() => setPresentTransition(1));
    }, 150);
  }, [presentIndex]);

  // Keyboard handling for present mode
  useEffect(() => {
    if (!presenting) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') stopPresenting();
      else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') presentNext();
      else if (e.key === 'ArrowLeft' || e.key === 'Backspace') presentPrev();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [presenting, presentNext, presentPrev, stopPresenting]);

  // Keyboard handling for editor
  useEffect(() => {
    if (presenting || editingElementId) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElementId && !editingElementId) {
          e.preventDefault();
          deleteSelectedElement();
        }
      }
      if (e.key === 'ArrowRight' && !e.shiftKey && !e.metaKey) {
        if (!editingElementId) goToSlide(safeIndex + 1);
      }
      if (e.key === 'ArrowLeft' && !e.shiftKey && !e.metaKey) {
        if (!editingElementId) goToSlide(safeIndex - 1);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [presenting, editingElementId, selectedElementId, deleteSelectedElement, goToSlide, safeIndex]);

  // ─── Render slide content (shared between canvas and present) ─────────

  const renderSlideContent = useCallback(
    (slide: SlideData, interactive: boolean, scale: number) => (
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          background: slide.background || '#ffffff',
        }}
        onClick={
          interactive
            ? () => {
                setSelectedElementId(null);
                setEditingElementId(null);
              }
            : undefined
        }
      >
        {slide.elements.map((el) =>
          interactive ? (
            <SlideElementView
              key={el.id}
              element={el}
              isSelected={el.id === selectedElementId}
              isEditing={el.id === editingElementId}
              scale={scale}
              onSelect={() => setSelectedElementId(el.id)}
              onEdit={() => {
                setSelectedElementId(el.id);
                setEditingElementId(el.id);
              }}
              onContentChange={(content) => updateElement(el.id, { content })}
              onStopEdit={() => setEditingElementId(null)}
            />
          ) : (
            <SlideElementView
              key={el.id}
              element={el}
              isSelected={false}
              isEditing={false}
              scale={scale}
              onSelect={() => {}}
              onEdit={() => {}}
              onContentChange={() => {}}
              onStopEdit={() => {}}
            />
          ),
        )}
      </div>
    ),
    [selectedElementId, editingElementId, updateElement],
  );

  // ─── Present mode overlay ─────────────────────────────────────────────────

  if (presenting) {
    const presentSlide = slides[presentIndex];
    if (!presentSlide) {
      setPresenting(false);
      return null;
    }
    return (
      <div style={styles.presentOverlay} onClick={presentNext}>
        <div style={{ ...styles.presentSlide, opacity: presentTransition, background: presentSlide.background || '#fff' }}>
          {renderSlideContent(presentSlide, false, 1)}
        </div>
        {/* Navigation hint */}
        <div
          style={{
            position: 'absolute',
            bottom: '20px',
            right: '20px',
            fontSize: '12px',
            color: 'rgba(255,255,255,0.3)',
            cursor: 'default',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {presentIndex + 1} / {slides.length} &middot; Press Esc to exit
        </div>
      </div>
    );
  }

  // ─── Editor mode ──────────────────────────────────────────────────────────

  return (
    <div style={styles.root}>
      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div style={styles.toolbar}>
        {/* Add slide dropdown */}
        <div style={{ position: 'relative' }} ref={addMenuRef}>
          <ToolbarButton label="+ Slide" title="Add new slide" onClick={() => setAddMenuOpen((v) => !v)} />
          {addMenuOpen && (
            <div style={styles.dropdownMenu}>
              {TEMPLATE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  style={styles.dropdownItem}
                  onClick={() => addSlide(opt.value)}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.background = 'transparent';
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <ToolbarButton label="Duplicate" title="Duplicate current slide" onClick={duplicateSlide} />
        <ToolbarButton
          label="Delete"
          title="Delete current slide"
          onClick={deleteSlide}
          disabled={slides.length <= 1}
        />

        <div style={styles.toolbarDivider} />

        {/* Element insertion */}
        <ToolbarButton label="T" title="Add text" onClick={() => addElement('text')} />
        <ToolbarButton label="H" title="Add heading" onClick={() => addElement('heading')} />
        <ToolbarButton label="List" title="Add bullet list" onClick={() => addElement('bullet-list')} />
        <ToolbarButton label="Img" title="Add image" onClick={() => addElement('image')} />

        {/* Shape dropdown */}
        <div style={{ position: 'relative' }} ref={shapeMenuRef}>
          <ToolbarButton label="Shape" title="Add shape" onClick={() => setShapeMenuOpen((v) => !v)} />
          {shapeMenuOpen && (
            <div style={styles.dropdownMenu}>
              {SHAPE_PRESETS.map((s) => (
                <button
                  key={s.shape}
                  style={styles.dropdownItem}
                  onClick={() => {
                    addElement('shape', s.shape);
                    setShapeMenuOpen(false);
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.background = 'transparent';
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={styles.toolbarDivider} />

        {/* Text formatting (active when element selected) */}
        <ToolbarButton
          label="B"
          title="Bold"
          active={selectedElement?.style?.fontWeight === '700'}
          onClick={() => toggleStyle('fontWeight', '700', '400')}
          disabled={!selectedElement || selectedElement.type === 'shape'}
        />
        <ToolbarButton
          label="I"
          title="Italic"
          active={selectedElement?.style?.fontStyle === 'italic'}
          onClick={() => toggleStyle('fontStyle', 'italic', 'normal')}
          disabled={!selectedElement || selectedElement.type === 'shape'}
        />
        <ToolbarButton
          label="A-"
          title="Decrease font size"
          onClick={() => changeFontSize(-2)}
          disabled={!selectedElement || selectedElement.type === 'shape'}
        />
        <ToolbarButton
          label="A+"
          title="Increase font size"
          onClick={() => changeFontSize(2)}
          disabled={!selectedElement || selectedElement.type === 'shape'}
        />

        <div style={styles.toolbarDivider} />

        {/* Alignment */}
        <ToolbarButton
          label="Left"
          title="Align left"
          active={selectedElement?.style?.textAlign === 'left'}
          onClick={() => setAlignment('left')}
          disabled={!selectedElement || selectedElement.type === 'shape'}
        />
        <ToolbarButton
          label="Center"
          title="Align center"
          active={selectedElement?.style?.textAlign === 'center'}
          onClick={() => setAlignment('center')}
          disabled={!selectedElement || selectedElement.type === 'shape'}
        />
        <ToolbarButton
          label="Right"
          title="Align right"
          active={selectedElement?.style?.textAlign === 'right'}
          onClick={() => setAlignment('right')}
          disabled={!selectedElement || selectedElement.type === 'shape'}
        />

        <div style={{ flex: 1 }} />

        {/* Present button */}
        <ToolbarButton
          label="Present"
          title="Start presentation (fullscreen)"
          onClick={startPresenting}
        />
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div style={styles.body}>
        {/* ── Left sidebar: slide thumbnails ──────────────────────────────── */}
        <div style={styles.slidePanel}>
          {slides.map((slide, i) => (
            <div
              key={slide.id}
              style={{
                ...styles.thumbnail,
                ...(i === safeIndex ? styles.thumbnailSelected : {}),
                background: slide.background || '#ffffff',
              }}
              onClick={() => goToSlide(i)}
            >
              <SlideThumbnail slide={slide} />
              <span style={styles.thumbnailLabel}>{i + 1}</span>
            </div>
          ))}
        </div>

        {/* ── Main canvas area ────────────────────────────────────────────── */}
        <div style={styles.mainArea}>
          <div style={styles.canvasWrapper}>
            <div
              ref={canvasRef}
              style={{
                ...styles.canvas,
                opacity: canvasTransition,
                background: currentSlideData?.background || '#ffffff',
              }}
            >
              {currentSlideData && renderSlideContent(currentSlideData, true, canvasScale)}
            </div>
          </div>

          {/* ── Speaker notes ─────────────────────────────────────────────── */}
          <div style={styles.notesArea}>
            <div style={styles.notesLabel}>Speaker Notes</div>
            <textarea
              style={styles.notesInput}
              placeholder="Add notes for this slide..."
              value={currentSlideData?.notes || ''}
              onChange={(e) => updateNotes(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div style={styles.footer}>
        <span>
          Slide {safeIndex + 1} of {slides.length}
        </span>
        <span style={{ textTransform: 'capitalize' }}>
          {currentSlideData?.template ?? 'blank'} layout
        </span>
      </div>
    </div>
  );
}

export default SlidesApp;
