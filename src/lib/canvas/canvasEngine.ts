import rough from 'roughjs';
import type React from 'react';
import { CanvasElement, CanvasLayer, DrawingInstruction, Point, ShapeKind, VoiceSettings } from '../../types';
import { BOARD_PREFIX, boardLayer } from './boardElements';
import { renderCanvasElement, renderCanvasBackground, renderDrawingCursor } from './roughRenderer';

export class CanvasEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private rc: any;

  // Elements on the board
  private elements: CanvasElement[] = [];
  
  // Layer Management
  public layers: CanvasLayer[] = [
    { id: 'layer-ai', name: 'Teolima Coach Doodles', visible: true, locked: false, opacity: 1, order: 0 },
    { id: 'layer-user', name: 'My Notes & Sketches', visible: true, locked: false, opacity: 1, order: 1 }
  ];
  public activeLayerId: string = 'layer-user';

  // History Stacks (Element + Layer State snapshots)
  private undoStack: Array<{ elements: CanvasElement[]; layers: CanvasLayer[] }> = [];
  private redoStack: Array<{ elements: CanvasElement[]; layers: CanvasLayer[] }> = [];

  // Animation Queue for Human-like progressive drawing
  private animationQueue: Array<{
    element: CanvasElement;
    durationMs: number;
    startTime: number;
  }> = [];

  // Viewport Transform
  public transform = { x: 0, y: 0, scale: 1 };
  private isPanning = false;
  private panStart = { x: 0, y: 0 };

  // Current User Drawing State
  public userTool: 'select' | 'pencil' | 'highlighter' | 'eraser' | 'shape' | 'text' | 'pan' = 'pan';
  public userShapeKind: ShapeKind = 'rectangle';
  public userStrokeColor = '#18181c'; // Teolima dark ink default
  public userFillColor = 'rgba(200, 241, 58, 0.2)'; // Volt accent fill
  public userStrokeWidth = 2.2;
  public userRoughness = 1.2;

  private isUserDrawing = false;
  private currentDraftElement: CanvasElement | null = null;
  private lastTipPoint: Point | null = null;

  // RAF loop
  private animFrameId: number | null = null;

  // Settings
  public settings: VoiceSettings = {
    voiceName: 'Kore',
    level: 2,
    animationSpeed: 'normal',
    handDrawnRoughness: 1.2,
    defaultStrokeWidth: 2,
    soundEffects: true,
    canvasTheme: 'paper-dots',
    aiLayerId: 'layer-ai',
  };

  // Listeners
  public onElementsChange?: (elements: CanvasElement[]) => void;
  public onLayersChange?: (layers: CanvasLayer[], activeLayerId: string) => void;
  public onActiveDrawingChange?: (isDrawing: boolean) => void;
  public onTextInputRequest?: (
    point: { world: Point; screen: Point },
    existingElement?: CanvasElement,
    dimensions?: { width?: number; height?: number }
  ) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Failed to get 2d context');
    this.ctx = context;
    this.rc = rough.canvas(canvas);

    this.startLoop();
  }

  public resize(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.rc = rough.canvas(this.canvas);
  }

  public setSettings(settings: Partial<VoiceSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  /**
   * Main Render and Animation Loop (60+ FPS via requestAnimationFrame)
   */
  private startLoop(): void {
    const loop = (timestamp: number) => {
      this.animFrameId = requestAnimationFrame(loop);
      this.updateAnimations(timestamp);
      this.render();
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  private updateAnimations(timestamp: number): void {
    if (this.animationQueue.length === 0) {
      if (this.lastTipPoint) {
        this.lastTipPoint = null;
        this.onActiveDrawingChange?.(false);
      }
      return;
    }

    const currentTask = this.animationQueue[0];
    if (!currentTask.startTime) {
      currentTask.startTime = timestamp;
      currentTask.element.isQueued = false;
      this.onActiveDrawingChange?.(true);
    }

    const elapsed = timestamp - currentTask.startTime;
    const progress = Math.min(1.0, elapsed / Math.max(50, currentTask.durationMs));

    currentTask.element.animationProgress = progress;

    if (progress >= 1.0) {
      currentTask.element.isAnimating = false;
      currentTask.element.isQueued = false;
      // Task finished, remove from queue
      this.animationQueue.shift();
      if (this.animationQueue.length > 0) {
        // Prime next task
        this.animationQueue[0].startTime = timestamp;
        this.animationQueue[0].element.isQueued = false;
      } else {
        this.onActiveDrawingChange?.(false);
      }
      this.notifyElementsChange();
    }
  }

  private render(): void {
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = this.canvas.width / dpr;
    const cssHeight = this.canvas.height / dpr;

    // 1. Reset transform to device-pixel-ratio scaling
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 2. Clear entire frame buffer
    this.ctx.clearRect(0, 0, cssWidth, cssHeight);

    // 3. Render canvas background in screen/world space
    renderCanvasBackground(this.ctx, cssWidth, cssHeight, this.settings.canvasTheme, this.transform);

    // 4. Set world transform for drawings
    this.ctx.save();
    this.ctx.translate(this.transform.x, this.transform.y);
    this.ctx.scale(this.transform.scale, this.transform.scale);

    let activeDrawingTip: Point | null = null;
    let activeAuthor: 'ai' | 'user' = 'ai';
    const activeTaskId = this.animationQueue[0]?.element.id;

    // 5. Render committed elements grouped by layer order
    const sortedLayers = [...this.layers].sort((a, b) => a.order - b.order);

    for (const layer of sortedLayers) {
      if (!layer.visible) continue;

      this.ctx.save();
      this.ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));

      const layerElements = this.elements.filter(
        (el) => (el.layerId || (el.author === 'ai' ? 'layer-ai' : 'layer-user')) === layer.id
      );

      for (const el of layerElements) {
        // Skip elements that are still waiting in the animation queue
        if (el.isQueued) continue;

        if (el.isAnimating && el.animationProgress !== undefined) {
          const result = renderCanvasElement(this.rc, this.ctx, el, el.animationProgress);
          // Only show pencil tip on the currently active task
          if (result.currentTip && el.id === activeTaskId) {
            activeDrawingTip = result.currentTip;
            activeAuthor = el.author;
          }
        } else {
          renderCanvasElement(this.rc, this.ctx, el, 1.0);
        }
      }

      this.ctx.restore();
    }

    // 6. Render active user drawing draft
    if (this.currentDraftElement) {
      const activeLayer = this.layers.find((l) => l.id === this.activeLayerId);
      const alpha = activeLayer && activeLayer.visible ? activeLayer.opacity : 1;
      
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      const result = renderCanvasElement(this.rc, this.ctx, this.currentDraftElement, 1.0);
      if (result.currentTip) {
        activeDrawingTip = result.currentTip;
        activeAuthor = 'user';
      }
      this.ctx.restore();
    }

    // 7. Render animated pen tip cursor if currently drawing
    if (activeDrawingTip) {
      this.lastTipPoint = activeDrawingTip;
      renderDrawingCursor(
        this.ctx,
        activeDrawingTip,
        activeAuthor,
        activeAuthor === 'ai' ? 'Sketching...' : 'Drawing'
      );
    }

    this.ctx.restore();
  }

  // --- Layer Operations ---

  public createLayer(name?: string): CanvasLayer {
    this.saveToUndo();
    const newLayer: CanvasLayer = {
      id: 'layer-' + Math.random().toString(36).substring(2, 9),
      name: name || `Layer ${this.layers.length + 1}`,
      visible: true,
      locked: false,
      opacity: 1,
      order: this.layers.length,
    };
    this.layers.push(newLayer);
    this.activeLayerId = newLayer.id;
    this.notifyLayersChange();
    return newLayer;
  }

  public deleteLayer(id: string): void {
    if (this.layers.length <= 1) return; // Keep at least one layer
    this.saveToUndo();
    this.layers = this.layers.filter((l) => l.id !== id);
    // Remove elements on deleted layer
    this.elements = this.elements.filter((el) => el.layerId !== id);
    if (this.activeLayerId === id) {
      this.activeLayerId = this.layers[0].id;
    }
    this.notifyLayersChange();
    this.notifyElementsChange();
  }

  public renameLayer(id: string, name: string): void {
    this.saveToUndo();
    const layer = this.layers.find((l) => l.id === id);
    if (layer) {
      layer.name = name;
      this.notifyLayersChange();
    }
  }

  public toggleLayerVisibility(id: string): void {
    const layer = this.layers.find((l) => l.id === id);
    if (layer) {
      layer.visible = !layer.visible;
      this.notifyLayersChange();
    }
  }

  public toggleLayerLock(id: string): void {
    const layer = this.layers.find((l) => l.id === id);
    if (layer) {
      layer.locked = !layer.locked;
      this.notifyLayersChange();
    }
  }

  public setLayerOpacity(id: string, opacity: number): void {
    const layer = this.layers.find((l) => l.id === id);
    if (layer) {
      layer.opacity = Math.max(0, Math.min(1, opacity));
      this.notifyLayersChange();
    }
  }

  public moveLayer(id: string, direction: 'up' | 'down'): void {
    this.saveToUndo();
    const index = this.layers.findIndex((l) => l.id === id);
    if (index < 0) return;

    if (direction === 'up' && index < this.layers.length - 1) {
      const temp = this.layers[index];
      this.layers[index] = this.layers[index + 1];
      this.layers[index + 1] = temp;
    } else if (direction === 'down' && index > 0) {
      const temp = this.layers[index];
      this.layers[index] = this.layers[index - 1];
      this.layers[index - 1] = temp;
    }

    // Reassign orders
    this.layers.forEach((l, idx) => {
      l.order = idx;
    });

    this.notifyLayersChange();
  }

  public setActiveLayer(id: string): void {
    if (this.layers.some((l) => l.id === id)) {
      this.activeLayerId = id;
      this.notifyLayersChange();
    }
  }

  private notifyLayersChange(): void {
    this.onLayersChange?.(this.layers, this.activeLayerId);
  }

  /**
   * Computes the exact rendered bounding box of any canvas element, taking into account
   * font metrics, role badges, subtext lines, image polaroid cards, and text halos.
   */
  public getElementBoundingBox(el: CanvasElement): {
    x: number;
    y: number;
    width: number;
    height: number;
    cx: number;
    cy: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
  } {
    if (el.type === 'image') {
      const w = el.width || 270;
      const h = el.height || 230;
      return {
        x: el.x,
        y: el.y,
        width: w,
        height: h,
        cx: el.x + w / 2,
        cy: el.y + h / 2,
        left: el.x,
        right: el.x + w,
        top: el.y,
        bottom: el.y + h,
      };
    } else if (el.type === 'shape') {
      const rawLabel = el.label || el.text || '';
      const rawSub = el.subtext || '';
      const labelW = rawLabel.length * 8.5;
      const subW = rawSub.length * 6.8;
      const neededWidth = Math.max(labelW + 36, subW + 36, 150);
      const renderW = Math.max(el.width || 160, neededWidth);
      const neededH = (rawLabel ? 32 : 0) + (rawSub ? 28 : 0) + (el.agentRole ? 24 : 10) + 20;
      const renderH = Math.max(el.height || 85, neededH, 80);

      const renderX = el.x - (renderW - (el.width || 160)) / 2;
      const renderY = el.y - (renderH - (el.height || 85)) / 2;

      return {
        x: renderX,
        y: renderY,
        width: renderW,
        height: renderH,
        cx: renderX + renderW / 2,
        cy: renderY + renderH / 2,
        left: renderX,
        right: renderX + renderW,
        top: renderY,
        bottom: renderY + renderH,
      };
    } else if (el.type === 'doodle' || el.type === 'text') {
      const text = el.text || el.label || '';
      const lines = text.split('\n');
      let maxLineChars = 0;
      lines.forEach((l) => {
        if (l.length > maxLineChars) maxLineChars = l.length;
      });
      const isCallout = el.doodleStyle === 'callout';
      const w = Math.max(isCallout ? 140 : 90, maxLineChars * 10.5 + (isCallout ? 36 : 14));
      const lineHeight = (el.fontSize || 20) * 1.35;
      const h = Math.max(30, lines.length * lineHeight + (isCallout ? 24 : 10));

      const top = el.y - (el.type === 'doodle' && !isCallout ? h * 0.8 : 0);
      return {
        x: el.x,
        y: top,
        width: w,
        height: h,
        cx: el.x + w / 2,
        cy: top + h / 2,
        left: el.x,
        right: el.x + w,
        top,
        bottom: top + h,
      };
    }

    const w = el.width || 120;
    const h = el.height || 70;
    return {
      x: el.x,
      y: el.y,
      width: w,
      height: h,
      cx: el.x + w / 2,
      cy: el.y + h / 2,
      left: el.x,
      right: el.x + w,
      top: el.y,
      bottom: el.y + h,
    };
  }

  /**
   * Summarizes all active canvas elements with their spatial coordinates and bounding boxes
   * for transmitting real-time spatial awareness to the AI architect.
   */
  public getElementsSummary(): Array<{
    id: string;
    type: string;
    role?: string;
    label?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    bbox: { left: number; top: number; right: number; bottom: number };
  }> {
    return this.elements
      .filter((e) => e.type !== 'stroke' || (e.points && e.points.length > 0))
      .map((e) => {
        const box = this.getElementBoundingBox(e);
        return {
          id: e.id,
          type: e.type,
          role: e.agentRole,
          label: e.label || e.text || e.imageCaption,
          x: Math.round(box.x),
          y: Math.round(box.y),
          width: Math.round(box.width),
          height: Math.round(box.height),
          bbox: {
            left: Math.round(box.left),
            top: Math.round(box.top),
            right: Math.round(box.right),
            bottom: Math.round(box.bottom),
          },
        };
      });
  }

  /**
   * Finds a node by label, agentRole, subtext, or ID with fuzzy matching
   */
  public findNodeByNameOrRole(query?: string): CanvasElement | null {
    if (!query || typeof query !== 'string') return null;
    const qClean = query.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!qClean) return null;

    const shapes = this.elements.filter(
      (e) => (e.type === 'shape' && e.shapeKind !== 'arrow' && e.shapeKind !== 'line') || e.type === 'image' || e.agentRole
    );

    // 1. Exact normalized label match
    for (let i = shapes.length - 1; i >= 0; i--) {
      const el = shapes[i];
      const elLabel = (el.label || el.text || el.imageCaption || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (elLabel && elLabel === qClean) return el;
    }

    // 2. Substring match on label
    for (let i = shapes.length - 1; i >= 0; i--) {
      const el = shapes[i];
      const elLabel = (el.label || el.text || el.imageCaption || '').toLowerCase();
      const qLower = query.toLowerCase();
      if (elLabel && (elLabel.includes(qLower) || qLower.includes(elLabel))) return el;
    }

    // 3. AgentRole match (e.g. 'router', 'guardrail', 'memory', 'tool', 'intake', 'agent')
    for (let i = shapes.length - 1; i >= 0; i--) {
      const el = shapes[i];
      if (el.agentRole && (el.agentRole.toLowerCase() === query.toLowerCase() || qClean.includes(el.agentRole.toLowerCase()))) {
        return el;
      }
    }

    // 4. Subtext match
    for (let i = shapes.length - 1; i >= 0; i--) {
      const el = shapes[i];
      const elSub = (el.subtext || '').toLowerCase();
      if (elSub && elSub.includes(query.toLowerCase())) return el;
    }

    // 5. ID match
    for (let i = shapes.length - 1; i >= 0; i--) {
      const el = shapes[i];
      if (el.id.toLowerCase().includes(qClean)) return el;
    }

    return null;
  }

  /**
   * Finds the closest node to a given point within maxDistance
   */
  public findClosestNode(point: Point, maxDistance = 180): CanvasElement | null {
    const shapes = this.elements.filter(
      (e) => (e.type === 'shape' && e.shapeKind !== 'arrow' && e.shapeKind !== 'line') || e.type === 'image' || e.agentRole
    );

    let closest: CanvasElement | null = null;
    let minDist = maxDistance;

    for (const s of shapes) {
      const box = this.getElementBoundingBox(s);
      const d = Math.hypot(point.x - box.cx, point.y - box.cy);
      if (d < minDist) {
        minDist = d;
        closest = s;
      }
    }

    return closest;
  }

  /**
   * Computes the exact perimeter anchor point on a node's border facing targetPoint.
   * This guarantees arrows start and end perfectly on node boundaries without overlapping card text or floating.
   */
  public computePerimeterAnchor(
    node: CanvasElement,
    targetPoint: Point,
    forceAnchor?: 'top' | 'bottom' | 'left' | 'right' | 'auto'
  ): Point {
    const box = this.getElementBoundingBox(node);

    if (forceAnchor === 'top') return { x: box.cx, y: box.top - 2 };
    if (forceAnchor === 'bottom') return { x: box.cx, y: box.bottom + 2 };
    if (forceAnchor === 'left') return { x: box.left - 2, y: box.cy };
    if (forceAnchor === 'right') return { x: box.right + 2, y: box.cy };

    const dx = targetPoint.x - box.cx;
    const dy = targetPoint.y - box.cy;

    if (Math.abs(dx) === 0 && Math.abs(dy) === 0) {
      return { x: box.right + 2, y: box.cy };
    }

    const aspect = box.height / box.width;
    if (Math.abs(dx) * aspect >= Math.abs(dy)) {
      // Horizontal exit
      if (dx >= 0) {
        return { x: box.right + 3, y: box.cy };
      } else {
        return { x: box.left - 3, y: box.cy };
      }
    } else {
      // Vertical exit
      if (dy >= 0) {
        return { x: box.cx, y: box.bottom + 3 };
      } else {
        return { x: box.cx, y: box.top - 3 };
      }
    }
  }

  /**
   * Multi-directional intelligent collision avoidance engine.
   * Checks proposed geometry against ALL solid obstacles (nodes, sketch cards, callouts, text blocks)
   * and separates them cleanly with a protective safety buffer.
   */
  public resolveCollision(
    proposed: { x: number; y: number; width: number; height: number },
    buffer = 24
  ): { x: number; y: number } {
    let curX = proposed.x;
    let curY = proposed.y;

    const obstacles = this.elements.filter(
      (e) => (e.type === 'shape' && e.shapeKind !== 'arrow' && e.shapeKind !== 'line') || e.type === 'image' || e.agentRole || e.type === 'doodle'
    );

    for (let iter = 0; iter < 6; iter++) {
      let collided = false;
      for (const obs of obstacles) {
        const box = this.getElementBoundingBox(obs);
        const overlapX = curX < box.right + buffer && curX + proposed.width > box.left - buffer;
        const overlapY = curY < box.bottom + buffer && curY + proposed.height > box.top - buffer;

        if (overlapX && overlapY) {
          // If vertical separation pushes beyond reasonable canvas height (>760), attempt horizontal separation
          if (box.bottom + buffer + proposed.height > 820) {
            curX = box.right + buffer;
          } else {
            curY = box.bottom + buffer;
          }
          collided = true;
          break;
        }
      }
      if (!collided) break;
    }

    return { x: curX, y: curY };
  }

  /**
   * Snaps or maps to architectural grid layout tiers with dynamic occupancy awareness.
   * If a slot in a column is already taken, it automatically cascades to the next open row.
   */
  public resolveGridPosition(params: {
    x?: number;
    y?: number;
    gridCol?: number;
    gridRow?: number;
    agentRole?: string;
    label?: string;
  }): { x: number; y: number } {
    const colMap: Record<number, number> = {
      1: 140, // Intake / Trigger
      2: 440, // Router / Orchestrator / Supervisor
      3: 780, // Workers / Tools / APIs
      4: 1100, // Guardrails / Memory / HITL
    };

    const rowMap: Record<number, number> = {
      1: 160,
      2: 340,
      3: 520,
      4: 700,
    };

    let targetCol = params.gridCol;
    if (!targetCol) {
      if (params.agentRole === 'intake') targetCol = 1;
      else if (params.agentRole === 'router') targetCol = 2;
      else if (params.agentRole === 'guardrail' || params.agentRole === 'human_approval' || params.agentRole === 'memory') targetCol = 4;
      else targetCol = 3;
    }

    const colX = colMap[targetCol] || 780;

    // Check existing nodes in this column to dynamically find the next open row slot if not explicitly provided
    if (!params.gridRow && params.y === undefined) {
      const existingInCol = this.elements.filter((e) => {
        if (e.type !== 'shape' && e.type !== 'image' && !e.agentRole) return false;
        const box = this.getElementBoundingBox(e);
        return Math.abs(box.cx - (colX + 80)) < 130;
      });

      const nextRowIdx = Math.min(4, existingInCol.length + 1);
      return { x: colX, y: rowMap[nextRowIdx] || 160 };
    }

    if (params.gridRow && rowMap[params.gridRow]) {
      return { x: colX, y: rowMap[params.gridRow] };
    }

    const rawX = params.x !== undefined ? params.x : colX;
    const rawY = params.y !== undefined ? params.y : 240;

    return { x: rawX, y: rawY };
  }

  /**
   * Dispatches AI tool instructions to the canvas with progressive drawing
   */
  public executeAIInstruction(instruction: DrawingInstruction): void {
    this.saveToUndo();

    const speedMultiplier = 
      this.settings.animationSpeed === 'fast' ? 0.4 : 
      this.settings.animationSpeed === 'slow' ? 1.6 : 0.8;

    const baseRoughness = this.settings.handDrawnRoughness || 1.4;
    const targetLayerId = this.settings.aiLayerId || (this.layers.find(l => l.id === 'layer-ai') ? 'layer-ai' : this.layers[0]?.id || 'layer-ai');

    switch (instruction.tool) {
      case 'draw_connection':
      case 'draw_shape': {
        const {
          shape = instruction.tool === 'draw_connection' ? 'arrow' : 'rectangle',
          x = 120,
          y = 120,
          width = 150,
          height = 95,
          label,
          strokeColor = '#18181c',
          fillColor = 'rgba(56, 189, 248, 0.16)',
          fillStyle = 'hachure',
          strokeWidth = this.settings.defaultStrokeWidth || 2,
          roughness = baseRoughness,
          fromNode,
          toNode,
          fromAnchor,
          toAnchor,
        } = instruction.params;

        let finalX = x;
        let finalY = y;
        let finalW = width;
        let finalH = height;

        // Exact Magnetic Perimeter Anchoring for Arrows & Connections
        if (shape === 'arrow' || instruction.tool === 'draw_connection') {
          let startPt: Point = { x, y };
          let endPt: Point = { x: x + width, y: y + height };

          const sourceNode = (fromNode ? this.findNodeByNameOrRole(fromNode) : null) || this.findClosestNode(startPt);
          const targetNode = (toNode ? this.findNodeByNameOrRole(toNode) : null) || this.findClosestNode(endPt);

          if (sourceNode && targetNode && sourceNode !== targetNode) {
            const targetBox = this.getElementBoundingBox(targetNode);
            const sourceBox = this.getElementBoundingBox(sourceNode);
            startPt = this.computePerimeterAnchor(sourceNode, { x: targetBox.cx, y: targetBox.cy }, fromAnchor);
            endPt = this.computePerimeterAnchor(targetNode, { x: sourceBox.cx, y: sourceBox.cy }, toAnchor);
          } else if (sourceNode) {
            startPt = this.computePerimeterAnchor(sourceNode, endPt, fromAnchor);
          } else if (targetNode) {
            endPt = this.computePerimeterAnchor(targetNode, startPt, toAnchor);
          }

          finalX = startPt.x;
          finalY = startPt.y;
          finalW = endPt.x - startPt.x;
          finalH = endPt.y - startPt.y;
        }

        const isFirstInQueue = this.animationQueue.length === 0;
        const newElement: CanvasElement = {
          id: 'ai-shape-' + Math.random().toString(36).substring(2, 9),
          type: 'shape',
          shapeKind: shape,
          x: finalX,
          y: finalY,
          width: finalW,
          height: finalH,
          label,
          strokeColor,
          fillColor,
          fillStyle,
          strokeWidth,
          roughness,
          author: 'ai',
          layerId: targetLayerId,
          timestamp: Date.now(),
          isAnimating: true,
          animationProgress: 0,
          isQueued: !isFirstInQueue,
        };

        this.elements.push(newElement);
        const duration = Math.max(300, Math.min(900, (Math.abs(finalW) + Math.abs(finalH)) * 2.2 * speedMultiplier));
        this.animationQueue.push({ element: newElement, durationMs: duration, startTime: 0 });
        break;
      }

      case 'draw_stroke': {
        const {
          points = [],
          strokeColor = '#18181c',
          strokeWidth = 2.2,
          roughness = baseRoughness,
        } = instruction.params;

        if (points.length < 2) return;

        const isFirstInQueue = this.animationQueue.length === 0;
        const newElement: CanvasElement = {
          id: 'ai-stroke-' + Math.random().toString(36).substring(2, 9),
          type: 'stroke',
          x: points[0].x,
          y: points[0].y,
          points,
          strokeColor,
          strokeWidth,
          roughness,
          author: 'ai',
          layerId: targetLayerId,
          timestamp: Date.now(),
          isAnimating: true,
          animationProgress: 0,
          isQueued: !isFirstInQueue,
        };

        this.elements.push(newElement);
        const duration = Math.max(250, Math.min(1000, points.length * 18 * speedMultiplier));
        this.animationQueue.push({ element: newElement, durationMs: duration, startTime: 0 });
        break;
      }

      case 'draw_doodle_writing': {
        const {
          text = '',
          x = 140,
          y = 140,
          fontSize = 24,
          strokeColor = '#18181c',
          doodleStyle = 'handwritten',
          fillColor,
          attachToNode,
          relativePosition = 'below',
        } = instruction.params;

        const noteWidth = Math.max(120, text.length * 10);
        const noteHeight = Math.max(28, (fontSize || 22) * 1.3);

        let posX = x;
        let posY = y;

        if (attachToNode) {
          const targetNode = this.findNodeByNameOrRole(attachToNode);
          if (targetNode) {
            const box = this.getElementBoundingBox(targetNode);
            if (relativePosition === 'above') {
              posX = box.cx - noteWidth / 2;
              posY = box.top - noteHeight - 16;
            } else if (relativePosition === 'right') {
              posX = box.right + 20;
              posY = box.cy;
            } else if (relativePosition === 'left') {
              posX = box.left - noteWidth - 20;
              posY = box.cy;
            } else {
              // Default: cleanly below node without overlapping bottom border
              posX = box.cx - noteWidth / 2;
              posY = box.bottom + 22;
            }
          }
        } else {
          // Resolve collision against overlapping nodes and sketches
          const resolved = this.resolveCollision({ x: posX, y: posY - 20, width: noteWidth, height: noteHeight + 10 }, 20);
          posX = resolved.x;
          posY = resolved.y + 20;
        }

        const isFirstInQueue = this.animationQueue.length === 0;
        const newElement: CanvasElement = {
          id: 'ai-doodle-' + Math.random().toString(36).substring(2, 9),
          type: 'doodle',
          x: posX,
          y: posY,
          text,
          fontSize,
          strokeColor,
          fillColor,
          doodleStyle,
          strokeWidth: 2,
          roughness: 1.4,
          author: 'ai',
          layerId: targetLayerId,
          timestamp: Date.now(),
          isAnimating: true,
          animationProgress: 0,
          isQueued: !isFirstInQueue,
        };

        this.elements.push(newElement);
        const duration = Math.max(200, Math.min(750, text.length * 28 * speedMultiplier));
        this.animationQueue.push({ element: newElement, durationMs: duration, startTime: 0 });
        break;
      }

      case 'draw_callout': {
        const {
          text = '',
          x = 160,
          y = 160,
          fontSize = 20,
          strokeColor = '#18181c',
          fillColor = 'rgba(200, 241, 58, 0.2)',
          attachToNode,
          relativePosition = 'below',
        } = instruction.params;

        const calloutW = Math.max(160, text.length * 9.5 + 32);
        const calloutH = 56;

        let posX = x;
        let posY = y;

        if (attachToNode) {
          const targetNode = this.findNodeByNameOrRole(attachToNode);
          if (targetNode) {
            const box = this.getElementBoundingBox(targetNode);
            if (relativePosition === 'above') {
              posX = box.cx - calloutW / 2;
              posY = box.top - calloutH - 20;
            } else if (relativePosition === 'right') {
              posX = box.right + 24;
              posY = box.top;
            } else if (relativePosition === 'left') {
              posX = box.left - calloutW - 24;
              posY = box.top;
            } else {
              posX = box.cx - calloutW / 2;
              posY = box.bottom + 26;
            }
          }
        } else {
          const resolved = this.resolveCollision({ x: posX, y: posY - 20, width: calloutW, height: calloutH }, 24);
          posX = resolved.x;
          posY = resolved.y + 20;
        }

        const isFirstInQueue = this.animationQueue.length === 0;
        const newElement: CanvasElement = {
          id: 'ai-callout-' + Math.random().toString(36).substring(2, 9),
          type: 'doodle',
          x: posX,
          y: posY,
          text,
          fontSize,
          strokeColor,
          fillColor,
          doodleStyle: 'callout',
          strokeWidth: 1.6,
          roughness: 1.4,
          author: 'ai',
          layerId: targetLayerId,
          timestamp: Date.now(),
          isAnimating: true,
          animationProgress: 0,
          isQueued: !isFirstInQueue,
        };

        this.elements.push(newElement);
        const duration = Math.max(300, Math.min(800, text.length * 26 * speedMultiplier));
        this.animationQueue.push({ element: newElement, durationMs: duration, startTime: 0 });
        break;
      }

      case 'draw_agent_node': {
        const {
          label = 'Agent',
          subtext = '',
          agentRole = 'agent',
          shape = 'rectangle',
          x = 300,
          y = 200,
          width = 160,
          height = 85,
          strokeColor = '#18181c',
          fillColor = 'rgba(240, 240, 242, 0.7)',
          gridColumn,
          gridRow,
        } = instruction.params;

        // Position with architectural grid alignment & overlap prevention
        const gridPos = this.resolveGridPosition({
          x,
          y,
          gridCol: gridColumn,
          gridRow: gridRow,
          agentRole,
          label,
        });

        const resolvedPos = this.resolveCollision(
          { x: gridPos.x, y: gridPos.y, width, height },
          24
        );

        const isFirstInQueue = this.animationQueue.length === 0;
        const newElement: CanvasElement = {
          id: `ai-agent-${agentRole}-${Math.random().toString(36).substring(2, 8)}`,
          type: 'shape',
          shapeKind: shape,
          agentRole,
          x: resolvedPos.x,
          y: resolvedPos.y,
          width,
          height,
          label,
          subtext,
          strokeColor,
          fillColor: agentRole === 'router' ? 'rgba(200, 241, 58, 0.22)' : fillColor,
          fillStyle: 'solid',
          strokeWidth: 2,
          roughness: baseRoughness,
          author: 'ai',
          layerId: targetLayerId,
          timestamp: Date.now(),
          isAnimating: true,
          animationProgress: 0,
          isQueued: !isFirstInQueue,
        };

        this.elements.push(newElement);
        this.animationQueue.push({ element: newElement, durationMs: 400 * speedMultiplier, startTime: 0 });
        break;
      }

      case 'draw_text': {
        const {
          text = '',
          x = 120,
          y = 120,
          fontSize = 18,
          strokeColor = '#18181c',
          fillColor,
        } = instruction.params;

        const isFirstInQueue = this.animationQueue.length === 0;
        const newElement: CanvasElement = {
          id: 'ai-text-' + Math.random().toString(36).substring(2, 9),
          type: 'text',
          x,
          y,
          text,
          fontSize,
          strokeColor,
          fillColor,
          strokeWidth: 1.5,
          roughness: baseRoughness,
          author: 'ai',
          layerId: targetLayerId,
          timestamp: Date.now(),
          isAnimating: true,
          animationProgress: 0,
          isQueued: !isFirstInQueue,
        };

        this.elements.push(newElement);
        const duration = Math.max(250, Math.min(800, text.length * 30 * speedMultiplier));
        this.animationQueue.push({ element: newElement, durationMs: duration, startTime: 0 });
        break;
      }

      case 'draw_diagram': {
        const { nodes = [], connections = [] } = instruction.params;
        const createdNodeEls: Map<string, CanvasElement> = new Map();

        // Sequence nodes first
        nodes.forEach((node, index) => {
          const shapeKind = node.shape || 'rectangle';
          const isFirstInQueue = this.animationQueue.length === 0 && index === 0;
          const nodeW = Math.max(140, (node.label.length * 8.5) + 36);
          const nodeH = 80;
          const nodeEl: CanvasElement = {
            id: `ai-node-${node.id || index}-${Math.random().toString(36).substring(2, 6)}`,
            type: 'shape',
            shapeKind,
            agentRole: node.role,
            x: node.x - nodeW / 2,
            y: node.y - nodeH / 2,
            width: nodeW,
            height: nodeH,
            label: node.label,
            subtext: node.sublabel,
            strokeColor: node.color || '#18181c',
            fillColor: node.fill || (node.role === 'router' ? 'rgba(200, 241, 58, 0.25)' : 'rgba(240, 240, 242, 0.8)'),
            fillStyle: 'solid',
            strokeWidth: 2,
            roughness: baseRoughness,
            author: 'ai',
            layerId: targetLayerId,
            timestamp: Date.now() + index * 10,
            isAnimating: true,
            animationProgress: 0,
            isQueued: !isFirstInQueue,
          };
          this.elements.push(nodeEl);
          createdNodeEls.set(node.id, nodeEl);
          this.animationQueue.push({ element: nodeEl, durationMs: 400 * speedMultiplier, startTime: 0 });
        });

        // Sequence connecting arrows with exact perimeter anchors
        connections.forEach((conn, index) => {
          const fromNode = createdNodeEls.get(conn.from) || this.findNodeByNameOrRole(conn.from);
          const toNode = createdNodeEls.get(conn.to) || this.findNodeByNameOrRole(conn.to);
          if (fromNode && toNode) {
            const targetBox = this.getElementBoundingBox(toNode);
            const sourceBox = this.getElementBoundingBox(fromNode);
            const startPt = this.computePerimeterAnchor(fromNode, { x: targetBox.cx, y: targetBox.cy });
            const endPt = this.computePerimeterAnchor(toNode, { x: sourceBox.cx, y: sourceBox.cy });

            const arrowEl: CanvasElement = {
              id: `ai-conn-${index}-${Math.random().toString(36).substring(2, 6)}`,
              type: 'shape',
              shapeKind: 'arrow',
              x: startPt.x,
              y: startPt.y,
              width: endPt.x - startPt.x,
              height: endPt.y - startPt.y,
              label: conn.label,
              strokeColor: '#5a5a62',
              strokeWidth: 1.8,
              roughness: baseRoughness,
              author: 'ai',
              layerId: targetLayerId,
              timestamp: Date.now() + 100 + index * 10,
              isAnimating: true,
              animationProgress: 0,
              isQueued: true,
            };
            this.elements.push(arrowEl);
            this.animationQueue.push({ element: arrowEl, durationMs: 380 * speedMultiplier, startTime: 0 });
          }
        });
        break;
      }

      case 'draw_math_or_chart': {
        const { chartType = 'bar', data = [], x = 120, y = 120 } = instruction.params;

        if (chartType === 'bar' && data.length > 0) {
          const isFirstInQueue = this.animationQueue.length === 0;
          // Draw axes
          const axisEl: CanvasElement = {
            id: 'ai-axis-' + Math.random().toString(36).substring(2, 7),
            type: 'stroke',
            x,
            y,
            points: [
              { x, y },
              { x, y: y + 200 },
              { x: x + data.length * 60 + 40, y: y + 200 },
            ],
            strokeColor: '#94a3b8',
            strokeWidth: 2.5,
            roughness: baseRoughness,
            author: 'ai',
            layerId: targetLayerId,
            timestamp: Date.now(),
            isAnimating: true,
            animationProgress: 0,
            isQueued: !isFirstInQueue,
          };
          this.elements.push(axisEl);
          this.animationQueue.push({ element: axisEl, durationMs: 380 * speedMultiplier, startTime: 0 });

          // Draw bars
          const maxVal = Math.max(...data.map((d) => d.value), 1);
          data.forEach((item, idx) => {
            const barHeight = (item.value / maxVal) * 160;
            const barEl: CanvasElement = {
              id: `ai-bar-${idx}-${Math.random().toString(36).substring(2, 6)}`,
              type: 'shape',
              shapeKind: 'rectangle',
              x: x + 20 + idx * 60,
              y: y + 200 - barHeight,
              width: 40,
              height: barHeight,
              label: `${item.label}: ${item.value}`,
              strokeColor: '#38bdf8',
              fillColor: 'rgba(56, 189, 248, 0.25)',
              fillStyle: 'zigzag',
              strokeWidth: 2,
              roughness: baseRoughness,
              author: 'ai',
              layerId: targetLayerId,
              timestamp: Date.now() + idx * 20,
              fontSize: 12,
              isAnimating: true,
              animationProgress: 0,
              isQueued: true,
            };
            this.elements.push(barEl);
            this.animationQueue.push({ element: barEl, durationMs: 350 * speedMultiplier, startTime: 0 });
          });
        }
        break;
      }

      case 'highlight_area': {
        const {
          targetNode,
          attachToNode,
          label,
          x,
          y,
          width,
          height,
          strokeColor = '#fbbf24',
          fillColor = 'rgba(251, 191, 36, 0.18)',
        } = instruction.params;

        let hlX = x ?? 100;
        let hlY = y ?? 100;
        let hlW = width ?? 160;
        let hlH = height ?? 100;

        const target = (targetNode || attachToNode || label) ? this.findNodeByNameOrRole(targetNode || attachToNode || label) : null;
        if (target) {
          const box = this.getElementBoundingBox(target);
          hlX = box.left - 16;
          hlY = box.top - 16;
          hlW = box.width + 32;
          hlH = box.height + 32;
        } else if (x !== undefined && y !== undefined) {
          // If no explicit node name was passed, check if (x, y) is pointing near a node
          const nearby = this.findClosestNode({ x, y }, 120);
          if (nearby) {
            const box = this.getElementBoundingBox(nearby);
            hlX = box.left - 16;
            hlY = box.top - 16;
            hlW = box.width + 32;
            hlH = box.height + 32;
          } else {
            hlX = x - 12;
            hlY = y - 12;
            hlW = Math.min(width || 150, 260);
            hlH = Math.min(height || 110, 180);
          }
        }

        const isFirstInQueue = this.animationQueue.length === 0;
        const hlEl: CanvasElement = {
          id: 'ai-hl-' + Math.random().toString(36).substring(2, 8),
          type: 'shape',
          shapeKind: 'ellipse',
          x: hlX,
          y: hlY,
          width: hlW,
          height: hlH,
          strokeColor,
          fillColor,
          fillStyle: 'dots',
          strokeWidth: 2.5,
          roughness: 1.8,
          author: 'ai',
          layerId: targetLayerId,
          timestamp: Date.now(),
          isAnimating: true,
          animationProgress: 0,
          isQueued: !isFirstInQueue,
        };
        this.elements.push(hlEl);
        this.animationQueue.push({ element: hlEl, durationMs: 380 * speedMultiplier, startTime: 0 });
        break;
      }

      case 'generate_sketch_illustration': {
        const {
          prompt = 'System Architecture Concept',
          imageCaption,
          label,
          text,
          imageUrl,
          attachToNode,
          relativePosition = 'below',
          x = 480,
          y = 220,
          width = 270,
          height = 230,
          aspectRatio = '4:3',
        } = instruction.params;

        let posX = x;
        let posY = y;

        if (attachToNode) {
          const targetNode = this.findNodeByNameOrRole(attachToNode);
          if (targetNode) {
            const box = this.getElementBoundingBox(targetNode);
            if (relativePosition === 'above') {
              posX = box.cx - width / 2;
              posY = box.top - height - 28;
            } else if (relativePosition === 'right') {
              posX = box.right + 28;
              posY = box.top;
            } else if (relativePosition === 'left') {
              posX = box.left - width - 28;
              posY = box.top;
            } else {
              // Default: below target node
              posX = box.cx - width / 2;
              posY = box.bottom + 28;
            }
          }
        } else {
          const resolved = this.resolveCollision({ x: posX, y: posY, width, height }, 28);
          posX = resolved.x;
          posY = resolved.y;
        }

        const isFirstInQueue = this.animationQueue.length === 0;
        const captionText = imageCaption || label || text || prompt.slice(0, 42);

        const imgEl: CanvasElement = {
          id: 'ai-img-' + Math.random().toString(36).substring(2, 9),
          type: 'image',
          x: posX,
          y: posY,
          width,
          height,
          imageUrl: imageUrl || '',
          imageCaption: captionText,
          imagePrompt: prompt,
          aspectRatio,
          strokeColor: '#18181c',
          strokeWidth: 1.8,
          roughness: baseRoughness,
          author: 'ai',
          layerId: targetLayerId,
          timestamp: Date.now(),
          isAnimating: true,
          animationProgress: 0,
          isQueued: !isFirstInQueue,
        };

        this.elements.push(imgEl);
        // Smooth progressive animation for pleasing subtle entry
        const duration = Math.max(500, Math.min(950, 650 * speedMultiplier));
        this.animationQueue.push({ element: imgEl, durationMs: duration, startTime: 0 });
        break;
      }

      case 'clear_canvas': {
        this.clear();
        break;
      }

      case 'undo_last_drawing': {
        this.undo();
        break;
      }
    }
  }

  // --- Mouse / Touch Interactive Co-sketching Handlers ---

  public handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>): void {
    const rect = this.canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    if (this.userTool === 'pan' || e.button === 1 || (e as any).spaceKey) {
      this.isPanning = true;
      this.panStart = { x: clientX - this.transform.x, y: clientY - this.transform.y };
      return;
    }

    const currentLayer = this.layers.find((l) => l.id === this.activeLayerId);
    if (currentLayer?.locked) {
      return; // Cannot draw on locked layer
    }

    const worldPoint = this.screenToWorld({ x: clientX, y: clientY });
    const targetLayerId = this.activeLayerId || this.layers[0]?.id || 'layer-user';

    if (this.userTool === 'text') {
      const clickedEl = this.findElementAt(worldPoint, 20);
      const targetTextEl =
        clickedEl && (clickedEl.type === 'text' || clickedEl.type === 'doodle' || clickedEl.label)
          ? clickedEl
          : undefined;

      this.isUserDrawing = true;
      this.currentDraftElement = {
        id: targetTextEl?.id || 'user-text-draft-' + Math.random().toString(36).substring(2, 9),
        type: 'text',
        x: targetTextEl ? targetTextEl.x : worldPoint.x,
        y: targetTextEl ? targetTextEl.y : worldPoint.y,
        width: targetTextEl?.width || 0,
        height: targetTextEl?.height || 0,
        text: targetTextEl?.text || targetTextEl?.label || '',
        strokeColor: targetTextEl?.strokeColor || this.userStrokeColor,
        strokeWidth: 1.5,
        roughness: this.userRoughness,
        fontSize: targetTextEl?.fontSize || 28,
        author: 'user',
        layerId: targetLayerId,
        timestamp: Date.now(),
      };
      return;
    }

    this.isUserDrawing = true;
    this.saveToUndo();

    if (this.userTool === 'pencil') {
      this.currentDraftElement = {
        id: 'user-stroke-' + Math.random().toString(36).substring(2, 9),
        type: 'stroke',
        x: worldPoint.x,
        y: worldPoint.y,
        points: [worldPoint],
        strokeColor: this.userStrokeColor,
        strokeWidth: this.userStrokeWidth,
        roughness: this.userRoughness,
        author: 'user',
        layerId: targetLayerId,
        timestamp: Date.now(),
      };
    } else if (this.userTool === 'highlighter') {
      this.currentDraftElement = {
        id: 'user-hl-' + Math.random().toString(36).substring(2, 9),
        type: 'stroke',
        x: worldPoint.x,
        y: worldPoint.y,
        points: [worldPoint],
        strokeColor: 'rgba(200, 241, 58, 0.5)', // brand volt, translucent
        strokeWidth: 16,
        roughness: 0.8,
        author: 'user',
        layerId: targetLayerId,
        timestamp: Date.now(),
      };
    } else if (this.userTool === 'shape') {
      this.currentDraftElement = {
        id: 'user-shape-' + Math.random().toString(36).substring(2, 9),
        type: 'shape',
        shapeKind: this.userShapeKind,
        x: worldPoint.x,
        y: worldPoint.y,
        width: 1,
        height: 1,
        strokeColor: this.userStrokeColor,
        fillColor: this.userFillColor,
        fillStyle: 'hachure',
        strokeWidth: this.userStrokeWidth,
        roughness: this.userRoughness,
        author: 'user',
        layerId: targetLayerId,
        timestamp: Date.now(),
      };
    } else if (this.userTool === 'eraser') {
      this.eraseAt(worldPoint);
    }
  }

  public handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>): void {
    const rect = this.canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    if (this.isPanning) {
      this.transform.x = clientX - this.panStart.x;
      this.transform.y = clientY - this.panStart.y;
      return;
    }

    if (!this.isUserDrawing) return;

    const worldPoint = this.screenToWorld({ x: clientX, y: clientY });

    if (this.userTool === 'eraser') {
      this.eraseAt(worldPoint);
      return;
    }

    if (!this.currentDraftElement) return;

    if (this.userTool === 'pencil' || this.userTool === 'highlighter') {
      const pts = this.currentDraftElement.points || [];
      const lastPt = pts[pts.length - 1];
      if (!lastPt || Math.hypot(worldPoint.x - lastPt.x, worldPoint.y - lastPt.y) > 3) {
        pts.push(worldPoint);
      }
    } else if (this.userTool === 'shape' || this.userTool === 'text') {
      const startX = this.currentDraftElement.x;
      const startY = this.currentDraftElement.y;
      this.currentDraftElement.width = worldPoint.x - startX;
      this.currentDraftElement.height = worldPoint.y - startY;
    }
  }

  public handlePointerUp(): void {
    if (this.isPanning) {
      this.isPanning = false;
      return;
    }

    if (this.isUserDrawing && this.currentDraftElement) {
      if (this.currentDraftElement.type === 'text') {
        const draft = this.currentDraftElement;
        let x = draft.x;
        let y = draft.y;
        let w = draft.width || 0;
        let h = draft.height || 0;

        if (w < 0) {
          x = x + w;
          w = Math.abs(w);
        }
        if (h < 0) {
          y = y + h;
          h = Math.abs(h);
        }

        const screenPos = this.worldToScreen({ x, y });
        const existingEl =
          draft.id && !draft.id.startsWith('user-text-draft-')
            ? this.elements.find((el) => el.id === draft.id)
            : undefined;

        this.isUserDrawing = false;
        this.currentDraftElement = null;

        if (this.onTextInputRequest) {
          this.onTextInputRequest(
            { world: { x, y }, screen: screenPos },
            existingEl,
            {
              width: w > 24 ? w * this.transform.scale : undefined,
              height: h > 24 ? h * this.transform.scale : undefined,
            }
          );
        }
        return;
      }

      if (this.currentDraftElement.type === 'shape') {
        const { x, y, width = 0, height = 0 } = this.currentDraftElement;
        if (this.currentDraftElement.shapeKind !== 'line' && this.currentDraftElement.shapeKind !== 'arrow') {
          if (width < 0) {
            this.currentDraftElement.x = x + width;
            this.currentDraftElement.width = Math.abs(width);
          }
          if (height < 0) {
            this.currentDraftElement.y = y + height;
            this.currentDraftElement.height = Math.abs(height);
          }
        }
      }

      if (
        (this.currentDraftElement.type === 'stroke' && (this.currentDraftElement.points?.length || 0) > 1) ||
        (this.currentDraftElement.type === 'shape' && (Math.abs(this.currentDraftElement.width || 0) > 4 || Math.abs(this.currentDraftElement.height || 0) > 4))
      ) {
        this.elements.push(this.currentDraftElement);
        this.notifyElementsChange();
      }
    }

    this.isUserDrawing = false;
    this.currentDraftElement = null;
  }

  public handleWheel(e: React.WheelEvent<HTMLCanvasElement>): void {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.2, Math.min(4.0, this.transform.scale * zoomFactor));

    this.transform.x = mouseX - (mouseX - this.transform.x) * (newScale / this.transform.scale);
    this.transform.y = mouseY - (mouseY - this.transform.y) * (newScale / this.transform.scale);
    this.transform.scale = newScale;
  }

  private eraseAt(worldPoint: Point): void {
    const threshold = 18;
    const lockedLayerIds = new Set(this.layers.filter((l) => l.locked).map((l) => l.id));
    const beforeCount = this.elements.length;

    this.elements = this.elements.filter((el) => {
      const layerId = el.layerId || (el.author === 'ai' ? 'layer-ai' : 'layer-user');
      if (lockedLayerIds.has(layerId)) {
        return true; // Keep locked elements
      }

      if (el.type === 'stroke' && el.points) {
        return !el.points.some((p) => Math.hypot(p.x - worldPoint.x, p.y - worldPoint.y) < threshold);
      }
      if (el.type === 'shape') {
        const minX = Math.min(el.x, el.x + (el.width || 0));
        const maxX = Math.max(el.x, el.x + (el.width || 0));
        const minY = Math.min(el.y, el.y + (el.height || 0));
        const maxY = Math.max(el.y, el.y + (el.height || 0));
        const inside = worldPoint.x >= minX - 12 && worldPoint.x <= maxX + 12 && worldPoint.y >= minY - 12 && worldPoint.y <= maxY + 12;
        return !inside;
      }
      if (el.type === 'text') {
        return Math.hypot(el.x - worldPoint.x, el.y - worldPoint.y) > 30;
      }
      return true;
    });

    if (this.elements.length !== beforeCount) {
      this.notifyElementsChange();
    }
  }

  public findElementAt(point: Point, hitPadding = 16): CanvasElement | null {
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const el = this.elements[i];
      const box = this.getElementBoundingBox(el);
      if (
        point.x >= box.left - hitPadding &&
        point.x <= box.right + hitPadding &&
        point.y >= box.top - hitPadding &&
        point.y <= box.bottom + hitPadding
      ) {
        return el;
      }
    }
    return null;
  }

  public addOrUpdateTextElement(params: {
    id?: string;
    x: number;
    y: number;
    text: string;
    fontSize?: number;
    strokeColor?: string;
    fillColor?: string;
    layerId?: string;
  }): void {
    if (!params.text || !params.text.trim()) return;
    this.saveToUndo();
    const targetLayerId =
      params.layerId || this.activeLayerId || this.layers[0]?.id || 'layer-user';

    if (params.id) {
      const existing = this.elements.find((e) => e.id === params.id);
      if (existing) {
        existing.text = params.text.trim();
        existing.label = params.text.trim();
        if (params.strokeColor) existing.strokeColor = params.strokeColor;
        if (params.fontSize) existing.fontSize = params.fontSize;
        if (params.fillColor !== undefined) existing.fillColor = params.fillColor;
        this.notifyElementsChange();
        return;
      }
    }

    const textEl: CanvasElement = {
      id: params.id || 'user-text-' + Math.random().toString(36).substring(2, 9),
      type: 'text',
      x: params.x,
      y: params.y,
      text: params.text.trim(),
      fontSize: params.fontSize || 20,
      strokeColor: params.strokeColor || this.userStrokeColor,
      fillColor: params.fillColor,
      strokeWidth: 1.5,
      roughness: this.userRoughness,
      author: 'user',
      layerId: targetLayerId,
      timestamp: Date.now(),
    };

    this.elements.push(textEl);
    this.notifyElementsChange();
  }

  public addSketchImageElement(params: {
    imageUrl: string;
    caption?: string;
    prompt?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    aspectRatio?: '1:1' | '4:3' | '16:9';
    layerId?: string;
    author?: 'ai' | 'user';
  }): CanvasElement {
    this.saveToUndo();
    const targetLayerId =
      params.layerId || (params.author === 'ai' ? (this.settings.aiLayerId || 'layer-ai') : this.activeLayerId || 'layer-user');

    const cardW = params.width || 270;
    const cardH = params.height || 230;

    let posX = params.x !== undefined ? params.x : 460;
    let posY = params.y !== undefined ? params.y : 220;

    const resolved = this.resolveCollision({ x: posX, y: posY, width: cardW, height: cardH }, 24);
    posX = resolved.x;
    posY = resolved.y;

    const speedMultiplier = 
      this.settings.animationSpeed === 'fast' ? 0.4 : 
      this.settings.animationSpeed === 'slow' ? 1.6 : 0.8;

    const isFirstInQueue = this.animationQueue.length === 0;
    const imgEl: CanvasElement = {
      id: `${params.author === 'user' ? 'user' : 'ai'}-img-${Math.random().toString(36).substring(2, 9)}`,
      type: 'image',
      x: posX,
      y: posY,
      width: cardW,
      height: cardH,
      imageUrl: params.imageUrl,
      imageCaption: params.caption || params.prompt || 'Architecture Sketch',
      imagePrompt: params.prompt,
      aspectRatio: params.aspectRatio || '4:3',
      strokeColor: '#18181c',
      strokeWidth: 1.8,
      roughness: this.settings.handDrawnRoughness || 1.3,
      author: params.author || 'user',
      layerId: targetLayerId,
      timestamp: Date.now(),
      isAnimating: true,
      animationProgress: 0,
      isQueued: !isFirstInQueue,
    };

    this.elements.push(imgEl);
    this.animationQueue.push({
      element: imgEl,
      durationMs: Math.max(450, Math.min(900, 650 * speedMultiplier)),
      startTime: 0,
    });

    this.notifyElementsChange();
    return imgEl;
  }

  public deleteElement(id: string): void {
    this.saveToUndo();
    this.elements = this.elements.filter((e) => e.id !== id);
    this.notifyElementsChange();
  }

  public screenToWorld(point: Point): Point {
    return {
      x: (point.x - this.transform.x) / this.transform.scale,
      y: (point.y - this.transform.y) / this.transform.scale,
    };
  }

  public worldToScreen(point: Point): Point {
    return {
      x: point.x * this.transform.scale + this.transform.x,
      y: point.y * this.transform.scale + this.transform.y,
    };
  }

  // --- Undo / Redo & State Control ---

  public saveToUndo(): void {
    this.undoStack.push({
      elements: JSON.parse(JSON.stringify(this.elements)),
      layers: JSON.parse(JSON.stringify(this.layers)),
    });
    if (this.undoStack.length > 40) this.undoStack.shift();
    this.redoStack = [];
  }

  public undo(): void {
    if (this.undoStack.length === 0) return;
    const prev = this.undoStack.pop()!;
    this.redoStack.push({
      elements: JSON.parse(JSON.stringify(this.elements)),
      layers: JSON.parse(JSON.stringify(this.layers)),
    });
    this.elements = prev.elements;
    this.layers = prev.layers;
    this.animationQueue = [];
    this.notifyElementsChange();
    this.notifyLayersChange();
  }

  public redo(): void {
    if (this.redoStack.length === 0) return;
    const next = this.redoStack.pop()!;
    this.undoStack.push({
      elements: JSON.parse(JSON.stringify(this.elements)),
      layers: JSON.parse(JSON.stringify(this.layers)),
    });
    this.elements = next.elements;
    this.layers = next.layers;
    this.animationQueue = [];
    this.notifyElementsChange();
    this.notifyLayersChange();
  }

  public clear(): void {
    this.saveToUndo();
    this.elements = [];
    this.animationQueue = [];
    this.notifyElementsChange();
  }

  public resetView(): void {
    this.transform = { x: 0, y: 0, scale: 1 };
  }

  public getElements(): CanvasElement[] {
    return this.elements;
  }

  /**
   * Brings the board model's elements on the canvas in line with `next`.
   * New elements are drawn with animation, existing ones are updated in place,
   * removed ones disappear. Everything the user drew by hand is left alone.
   */
  public syncBoardElements(next: CanvasElement[]): void {
    const isBoard = (el: CanvasElement) => el.id.startsWith(BOARD_PREFIX);
    const previous = new Map(this.elements.filter(isBoard).map((el) => [el.id, el]));
    const keep = new Set(next.map((el) => el.id));

    this.elements = this.elements.filter((el) => !isBoard(el) || keep.has(el.id));
    this.animationQueue = this.animationQueue.filter((task) => !isBoard(task.element) || keep.has(task.element.id));

    const speed = this.settings.animationSpeed === 'fast' ? 0.6 : this.settings.animationSpeed === 'slow' ? 1.5 : 1;
    for (const el of next) {
      const existing = previous.get(el.id);
      if (existing) {
        const { isAnimating, animationProgress, isQueued } = existing;
        Object.assign(existing, el, { isAnimating, animationProgress, isQueued });
        continue;
      }
      const fresh: CanvasElement = { ...el, timestamp: Date.now(), isAnimating: true, animationProgress: 0, isQueued: this.animationQueue.length > 0 };
      this.elements.push(fresh);
      const ms = el.shapeKind === 'connector' ? 450 : el.shapeKind === 'container' ? 300 : 380;
      this.animationQueue.push({ element: fresh, durationMs: ms * speed, startTime: 0 });
    }

    // stable sort keeps the user's own drawings in their order, on top
    this.elements = this.elements
      .map((el, i) => ({ el, i }))
      .sort((a, b) => boardLayer(a.el.id) - boardLayer(b.el.id) || a.i - b.i)
      .map(({ el }) => el);
    this.notifyElementsChange();
  }

  /**
   * Fits `box` (world coordinates) into the view, but only when part of it is
   * off screen, so the view does not jump on every small change.
   */
  public ensureVisible(box: { x: number; y: number; w: number; h: number }): void {
    const dpr = window.devicePixelRatio || 1;
    const cssW = this.canvas.width / dpr;
    const cssH = this.canvas.height / dpr;
    const pad = { top: 110, right: 40, bottom: 150, left: 40 };
    const t = this.transform;
    const sx = box.x * t.scale + t.x;
    const sy = box.y * t.scale + t.y;
    const ex = (box.x + box.w) * t.scale + t.x;
    const ey = (box.y + box.h) * t.scale + t.y;
    if (sx >= pad.left && sy >= pad.top && ex <= cssW - pad.right && ey <= cssH - pad.bottom) return;
    const availW = cssW - pad.left - pad.right;
    const availH = cssH - pad.top - pad.bottom;
    const scale = Math.max(0.35, Math.min(1, availW / box.w, availH / box.h));
    this.transform = {
      scale,
      x: pad.left + (availW - box.w * scale) / 2 - box.x * scale,
      y: pad.top - box.y * scale,
    };
  }

  public setElements(elements: CanvasElement[]): void {
    this.saveToUndo();
    this.elements = elements;
    this.notifyElementsChange();
  }

  private notifyElementsChange(): void {
    this.onElementsChange?.(this.elements);
  }

  /**
   * Exports full canvas as PNG
   */
  public exportImage(): string {
    return this.canvas.toDataURL('image/png');
  }

  public destroy(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
  }
}
