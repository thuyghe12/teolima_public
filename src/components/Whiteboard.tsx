import React, { useEffect, useRef, useState } from 'react';
import { CanvasEngine } from '../lib/canvas/canvasEngine';
import { CanvasElement, CanvasLayer, VoiceSettings } from '../types';
import { ZoomIn, ZoomOut, Maximize2, Sparkles } from 'lucide-react';

interface WhiteboardProps {
  onEngineReady: (engine: CanvasEngine) => void;
  settings: VoiceSettings;
  isAiDrawing: boolean;
  onLayersUpdate?: (layers: CanvasLayer[], activeLayerId: string) => void;
}

interface InlineTextEditorState {
  id?: string;
  worldX: number;
  worldY: number;
  screenX: number;
  screenY: number;
  width?: number;
  height?: number;
  text: string;
  fontSize: number;
  strokeColor: string;
}

export const Whiteboard: React.FC<WhiteboardProps> = ({
  onEngineReady,
  settings,
  isAiDrawing,
  onLayersUpdate,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  const [zoom, setZoom] = useState(100);
  const [elementCount, setElementCount] = useState(0);
  const [activeTool, setActiveTool] = useState<string>('pencil');
  const [inlineEditor, setInlineEditor] = useState<InlineTextEditorState | null>(null);
  const [editorText, setEditorText] = useState<string>('');

  const inlineEditorRef = useRef<InlineTextEditorState | null>(null);
  const editorTextRef = useRef<string>('');

  // Keep editorTextRef in sync
  useEffect(() => {
    editorTextRef.current = editorText;
  }, [editorText]);

  // Initialize CanvasEngine
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const engine = new CanvasEngine(canvasRef.current);
    engine.setSettings(settings);
    engineRef.current = engine;

    // Handle element changes
    engine.onElementsChange = (elements) => {
      setElementCount(elements.length);
    };

    // Handle layer changes
    engine.onLayersChange = (layers, activeId) => {
      onLayersUpdate?.(layers, activeId);
    };

    // Handle Text tool request on click or drag
    engine.onTextInputRequest = (point, existingElement, dimensions) => {
      // Commit previous text if active
      if (inlineEditorRef.current) {
        const prev = inlineEditorRef.current;
        const trimmed = (editorTextRef.current || prev.text).trim();
        if (trimmed) {
          engine.addOrUpdateTextElement({
            id: prev.id,
            x: prev.worldX,
            y: prev.worldY,
            text: trimmed,
            fontSize: prev.fontSize || 28,
            strokeColor: prev.strokeColor,
          });
        }
      }

      const initialText = existingElement ? (existingElement.text || existingElement.label || '') : '';
      const initialFontSize = existingElement?.fontSize || 28;
      const initialStroke = existingElement?.strokeColor || engine.userStrokeColor || '#18181c';

      const newEditor: InlineTextEditorState = {
        id: existingElement?.id,
        worldX: existingElement ? existingElement.x : point.world.x,
        worldY: existingElement ? existingElement.y : point.world.y,
        screenX: point.screen.x,
        screenY: point.screen.y,
        width: dimensions?.width,
        height: dimensions?.height,
        text: initialText,
        fontSize: initialFontSize,
        strokeColor: initialStroke,
      };

      inlineEditorRef.current = newEditor;
      editorTextRef.current = initialText;
      setEditorText(initialText);
      setInlineEditor(newEditor);
    };

    onEngineReady(engine);

    // Responsive resize with ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          engine.resize(width, height);
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    // Initial sizing
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width && rect.height) {
      engine.resize(rect.width, rect.height);
    }

    // Keyboard Shortcuts for Undo/Redo & Spacebar Panning
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          engine.redo();
        } else {
          engine.undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        engine.redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      resizeObserver.disconnect();
      engine.destroy();
    };
  }, []);

  // Sync settings when changed
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setSettings(settings);
    }
  }, [settings]);

  // Focus textarea when editor opens
  useEffect(() => {
    if (inlineEditor && textInputRef.current) {
      textInputRef.current.focus();
      const len = textInputRef.current.value.length;
      textInputRef.current.setSelectionRange(len, len);
    }
  }, [inlineEditor?.worldX, inlineEditor?.worldY, inlineEditor?.id]);

  // Track active tool & zoom level updates smoothly
  useEffect(() => {
    const interval = setInterval(() => {
      if (engineRef.current) {
        const newZoom = Math.round(engineRef.current.transform.scale * 100);
        const newTool = engineRef.current.userTool;
        setZoom((prev) => (prev !== newZoom ? newZoom : prev));
        setActiveTool((prev) => (prev !== newTool ? newTool : prev));
      }
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const handleZoomIn = () => {
    if (!engineRef.current) return;
    engineRef.current.transform.scale = Math.min(4.0, engineRef.current.transform.scale * 1.2);
    setZoom(Math.round(engineRef.current.transform.scale * 100));
  };

  const handleZoomOut = () => {
    if (!engineRef.current) return;
    engineRef.current.transform.scale = Math.max(0.2, engineRef.current.transform.scale / 1.2);
    setZoom(Math.round(engineRef.current.transform.scale * 100));
  };

  const handleResetZoom = () => {
    if (!engineRef.current) return;
    engineRef.current.resetView();
    setZoom(100);
  };

  const handleCommitText = (overrideText?: string) => {
    const cur = inlineEditorRef.current;
    if (!engineRef.current || !cur) return;

    const raw = overrideText !== undefined ? overrideText : editorTextRef.current;
    const trimmed = raw.trim();

    if (trimmed) {
      engineRef.current.addOrUpdateTextElement({
        id: cur.id,
        x: cur.worldX,
        y: cur.worldY,
        text: trimmed,
        fontSize: cur.fontSize || 28,
        strokeColor: cur.strokeColor,
      });
    } else if (cur.id && !cur.id.startsWith('user-text-draft-')) {
      engineRef.current.deleteElement(cur.id);
    }

    inlineEditorRef.current = null;
    editorTextRef.current = '';
    setInlineEditor(null);
    setEditorText('');
  };

  const handleCancelText = () => {
    inlineEditorRef.current = null;
    editorTextRef.current = '';
    setInlineEditor(null);
    setEditorText('');
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // If text editor is currently open, commit its text
    if (inlineEditorRef.current) {
      handleCommitText();
    }
    engineRef.current?.handlePointerDown(e);
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!engineRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const worldPoint = engineRef.current.screenToWorld({ x: clientX, y: clientY });
    const clickedEl = engineRef.current.findElementAt(worldPoint, 20);

    engineRef.current.onTextInputRequest?.(
      { world: worldPoint, screen: { x: clientX, y: clientY } },
      clickedEl || undefined
    );
  };

  const cursorClass =
    activeTool === 'text'
      ? 'cursor-text'
      : activeTool === 'pan'
      ? 'cursor-grab'
      : activeTool === 'eraser'
      ? 'cursor-crosshair'
      : 'cursor-crosshair';

  return (
    <div
      id="whiteboard-container"
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden select-none bg-[#fafafa] ${cursorClass}`}
    >
      <canvas
        id="whiteboard-canvas"
        ref={canvasRef}
        className="absolute inset-0 block w-full h-full touch-none"
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={(e) => engineRef.current?.handlePointerMove(e)}
        onPointerUp={() => engineRef.current?.handlePointerUp()}
        onPointerLeave={() => engineRef.current?.handlePointerUp()}
        onDoubleClick={handleCanvasDoubleClick}
        onWheel={(e) => engineRef.current?.handleWheel(e)}
      />

      {/* Natural Whiteboard Direct Text Box */}
      {inlineEditor && (
        <div
          id="canvas-inline-textbox-container"
          className="absolute z-40"
          style={{
            left: `${inlineEditor.screenX}px`,
            top: `${inlineEditor.screenY}px`,
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <textarea
            ref={textInputRef}
            id="canvas-direct-textbox"
            autoFocus
            value={editorText}
            onChange={(e) => {
              const val = e.target.value;
              editorTextRef.current = val;
              setEditorText(val);
            }}
            onBlur={() => handleCommitText()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleCommitText(e.currentTarget.value);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancelText();
              }
            }}
            placeholder="Type text..."
            rows={Math.max(1, editorText.split('\n').length)}
            className="min-w-[140px] px-2.5 py-1 rounded-md border-2 border-dashed border-[#18181c]/60 bg-white/95 shadow-md outline-none resize-both leading-tight placeholder:text-zinc-400"
            style={{
              width: inlineEditor.width ? `${Math.max(140, inlineEditor.width)}px` : undefined,
              height: inlineEditor.height ? `${Math.max(38, inlineEditor.height)}px` : undefined,
              color: inlineEditor.strokeColor || '#18181c',
              fontSize: `${Math.max(22, Math.round(inlineEditor.fontSize * (zoom / 100)))}px`,
              fontFamily: "'Nanum Pen Script', cursive, sans-serif",
            }}
          />
        </div>
      )}

      {/* Floating Status Badge when Coach is dynamically doodling */}
      {isAiDrawing && (
        <div
          id="ai-drawing-status-pill"
          className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#18181c] text-[#c8f13a] text-xs font-mono-code font-bold shadow-lg shadow-black/10 backdrop-blur-md animate-pulse border border-[#c8f13a]/30"
        >
          <Sparkles className="w-3.5 h-3.5 animate-spin text-[#c8f13a]" />
          <span>Teolima Coach Doodling Architecture...</span>
        </div>
      )}

      {/* Canvas Viewport Zoom & Info Dock */}
      <div
        id="canvas-viewport-dock"
        className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-white/95 shadow-md border border-[#e2e2e6] text-[#18181c] text-xs font-medium backdrop-blur-md"
      >
        <button
          id="btn-zoom-out"
          onClick={handleZoomOut}
          title="Zoom Out"
          className="p-1 rounded-lg hover:bg-[#f0f0f2] transition-colors text-[#5a5a62] hover:text-[#18181c]"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          id="btn-reset-zoom"
          onClick={handleResetZoom}
          title="Reset View"
          className="px-2 py-0.5 rounded hover:bg-[#f0f0f2] transition-colors tabular-nums font-mono-code text-[#18181c]"
        >
          {zoom}%
        </button>
        <button
          id="btn-zoom-in"
          onClick={handleZoomIn}
          title="Zoom In"
          className="p-1 rounded-lg hover:bg-[#f0f0f2] transition-colors text-[#5a5a62] hover:text-[#18181c]"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <div className="h-3.5 w-px bg-[#e2e2e6] mx-1" />
        <button
          id="btn-fit-screen"
          onClick={handleResetZoom}
          title="Center View"
          className="p-1 rounded-lg hover:bg-[#f0f0f2] transition-colors text-[#5a5a62] hover:text-[#18181c]"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] font-mono-code text-[#87868e] pl-1">
          {elementCount} {elementCount === 1 ? 'element' : 'elements'}
        </span>
      </div>
    </div>
  );
};
