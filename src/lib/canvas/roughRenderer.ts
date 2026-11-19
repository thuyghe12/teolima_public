import rough from 'roughjs';
import { CanvasElement, Point, ShapeKind } from '../../types';

// Global image cache for 60fps rendering without image reload jitter
const imageElementCache = new Map<string, HTMLImageElement>();

export function getCachedImage(src: string): HTMLImageElement | null {
  if (!src) return null;
  let img = imageElementCache.get(src);
  if (!img) {
    img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.crossOrigin = 'anonymous';
    img.src = src;
    imageElementCache.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

// Deterministic seed helper so rough.js does not jitter on each frame
export function stringToSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash) || 1;
}

/**
 * Splits text into lines that fit comfortably within maxWidth
 */
export function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (!text) return [];
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    const words = para.split(/\s+/);
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const testLine = currentLine + ' ' + word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}

/**
 * Draws a single CanvasElement onto the canvas using Rough.js and Teolima Hand styling
 * Features:
 * - Dynamic card auto-sizing so labels and subtitles NEVER overflow boundaries
 * - Multiline text wrapping with comfortable internal padding
 * - Opaque background masking to prevent background lines/arrows from clashing with text
 * - Text halo isolation for doodle writings and arrow labels
 */
export function renderCanvasElement(
  rc: any,
  ctx: CanvasRenderingContext2D,
  element: CanvasElement,
  progress: number = 1.0
): { currentTip?: Point } {
  const {
    id,
    type,
    shapeKind = 'rectangle',
    agentRole,
    x,
    y,
    width = 160,
    height = 85,
    points = [],
    text = '',
    subtext = '',
    fontSize = 18,
    strokeColor = '#18181c', // Default Teolima dark ink
    fillColor,
    fillStyle = 'solid',
    strokeWidth = 2,
    roughness = 1.2,
    label,
    doodleStyle
  } = element;

  const seed = stringToSeed(id);
  const clampedProgress = Math.max(0.01, Math.min(1.0, progress));
  
  const options: any = {
    seed,
    roughness: Math.max(0.1, roughness),
    bowing: 1.2,
    stroke: strokeColor || '#18181c',
    strokeWidth: Math.max(1.2, strokeWidth),
    fill: clampedProgress >= 0.95 && fillColor && fillColor !== 'transparent' ? fillColor : undefined,
    fillStyle: fillStyle === 'none' ? undefined : fillStyle,
    fillWeight: strokeWidth * 0.8,
    hachureGap: 6,
  };

  let currentTip: Point | undefined;

  ctx.save();

  if (type === 'stroke' && points.length > 0) {
    // Freeform stroke interpolation
    const totalPoints = points.length;
    const count = Math.max(2, Math.floor(totalPoints * clampedProgress));
    const activePoints = points.slice(0, count);

    if (activePoints.length >= 2) {
      const ptsArray: [number, number][] = activePoints.map((p) => [p.x, p.y]);
      rc.curve(ptsArray, options);
      const last = activePoints[activePoints.length - 1];
      currentTip = { x: last.x, y: last.y };
    }
  } else if (type === 'doodle') {
    // Handwritten doodle explainer words & callouts
    const fullText = text || label || '';
    const actualFontSize = fontSize || 24;
    ctx.font = `400 ${actualFontSize}px 'Nanum Pen Script', cursive, sans-serif`;

    const maxWrapW = 320;
    const textLines = fullText.includes('\n') || ctx.measureText(fullText).width > maxWrapW
      ? wrapTextLines(ctx, fullText, maxWrapW)
      : [fullText];

    const lineHeight = actualFontSize * 1.05;
    const totalTextHeight = textLines.length * lineHeight;
    let maxLineWidth = 0;
    for (const line of textLines) {
      const w = ctx.measureText(line).width;
      if (w > maxLineWidth) maxLineWidth = w;
    }

    if (doodleStyle === 'callout') {
      // Thought/speech bubble with opaque background mask
      const padX = 18;
      const padY = 12;
      const boxW = maxLineWidth + padX * 2;
      const boxH = totalTextHeight + padY * 2;
      const boxX = x - padX;
      const boxY = y - actualFontSize - padY + 6;

      // 1. Opaque card mask behind callout so underlying arrows/lines never show through
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(boxX, boxY, boxW, boxH);

      // 2. Hand-drawn rough container
      rc.rectangle(boxX, boxY, boxW, boxH, {
        seed: seed + 2,
        roughness: 1.3,
        stroke: strokeColor || '#5a5a62',
        strokeWidth: 1.4,
        fill: fillColor || 'rgba(200, 241, 58, 0.16)',
        fillStyle: 'solid'
      });

      // 3. Render lines of text
      ctx.fillStyle = strokeColor || '#18181c';
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';

      textLines.forEach((line, idx) => {
        const lineCharCount = Math.max(1, Math.floor(line.length * clampedProgress));
        const visibleLine = line.slice(0, lineCharCount);
        const lineY = boxY + padY + actualFontSize * 0.8 + idx * lineHeight;
        ctx.fillText(visibleLine, x, lineY);
      });

      const lastLine = textLines[textLines.length - 1] || '';
      currentTip = { x: x + ctx.measureText(lastLine).width + 6, y: y + totalTextHeight / 2 };
    } else {
      // Standalone handwritten doodle writing with protective text halo
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';

      textLines.forEach((line, idx) => {
        const lineCharCount = Math.max(1, Math.floor(line.length * clampedProgress));
        const visibleLine = line.slice(0, lineCharCount);
        const lineY = y + idx * lineHeight;

        // Subtle paper halo behind characters to keep text crisp over background lines
        ctx.strokeStyle = '#fafafa';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeText(visibleLine, x, lineY);

        ctx.fillStyle = strokeColor || '#18181c';
        ctx.fillText(visibleLine, x, lineY);
      });

      const lastLine = textLines[textLines.length - 1] || '';
      const visibleMetrics = ctx.measureText(lastLine);
      currentTip = { x: x + visibleMetrics.width + 4, y: y - actualFontSize / 2 };

      // Doodle styles: annotated wavy underline or spark dot
      if (clampedProgress >= 0.8) {
        const underlineY = y + totalTextHeight - lineHeight + 6;
        const textW = maxLineWidth;

        if (doodleStyle === 'annotated' || doodleStyle === 'handwritten') {
          // Hand-drawn wavy underline
          rc.curve([
            [x - 4, underlineY],
            [x + textW * 0.5, underlineY + 3],
            [x + textW + 8, underlineY]
          ], {
            seed: seed + 1,
            roughness: 1.6,
            stroke: strokeColor || '#18181c',
            strokeWidth: 2
          });
        } else if (doodleStyle === 'spark') {
          // Volt joy spark dot
          ctx.fillStyle = '#c8f13a';
          ctx.beginPath();
          ctx.arc(x + textW + 10, y - actualFontSize * 0.6, 4.5, 0, 2 * Math.PI);
          ctx.fill();
          ctx.strokeStyle = '#18181c';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  } else if (type === 'shape') {
    switch (shapeKind) {
      case 'container': {
        // A team: dashed outline and the pattern label in its header. Drawn under its cards.
        ctx.save();
        ctx.globalAlpha = Math.min(1, clampedProgress * 1.5);
        ctx.setLineDash([10, 7]);
        ctx.strokeStyle = strokeColor || '#87868e';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 14);
        ctx.stroke();
        ctx.setLineDash([]);
        if (label) {
          const [pattern, ...rest] = label.split(' · ');
          ctx.font = `600 11px 'IBM Plex Mono', monospace`;
          const pw = ctx.measureText(pattern).width + 14;
          ctx.fillStyle = pattern === 'NO TEAM YET' ? '#f0f0f2' : '#c8f13a';
          ctx.strokeStyle = '#18181c';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(x + 16, y + 13, pw, 20, 4);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#18181c';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(pattern, x + 23, y + 23);
          if (rest.length) {
            ctx.font = `600 14px 'Karla', sans-serif`;
            ctx.fillText(rest.join(' · '), x + 16 + pw + 10, y + 23);
          }
        }
        ctx.restore();
        break;
      }

      case 'boundary': {
        // The system boundary: a solid outline with a small label, drawn behind everything.
        ctx.save();
        ctx.globalAlpha = Math.min(1, clampedProgress * 1.5);
        ctx.strokeStyle = strokeColor || '#5a5a62';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 18);
        ctx.stroke();
        if (label) {
          ctx.font = `600 11px 'IBM Plex Mono', monospace`;
          ctx.fillStyle = '#5a5a62';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, x + 18, y + 20);
        }
        ctx.restore();
        break;
      }

      case 'band': {
        // A guardrail across the system: a tinted strip with its controls and scope on one line.
        ctx.save();
        ctx.globalAlpha = Math.min(1, clampedProgress * 1.5);
        ctx.fillStyle = '#fef2f2';
        ctx.strokeStyle = '#991b1b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 8);
        ctx.fill();
        ctx.stroke();
        ctx.font = `600 11px 'IBM Plex Mono', monospace`;
        const tag = 'GUARDRAIL';
        const tw = ctx.measureText(tag).width + 14;
        ctx.fillStyle = '#fee2e2';
        ctx.beginPath();
        ctx.roundRect(x + 12, y + (height - 20) / 2, tw, 20, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#991b1b';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(tag, x + 19, y + height / 2);
        ctx.fillStyle = '#18181c';
        ctx.font = `600 14px 'Karla', sans-serif`;
        const name = label || '';
        ctx.fillText(name, x + 12 + tw + 12, y + height / 2);
        if (subtext) {
          const nw = ctx.measureText(name).width;
          ctx.font = `400 12px 'IBM Plex Mono', monospace`;
          ctx.fillStyle = '#5a5a62';
          ctx.fillText(subtext, x + 12 + tw + 12 + nw + 14, y + height / 2);
        }
        ctx.restore();
        break;
      }

      case 'legend': {
        // Names the line and border styles in use, left to right.
        const items = element.legendItems || [];
        ctx.save();
        ctx.globalAlpha = Math.min(1, clampedProgress * 1.5);
        ctx.font = `400 12px 'IBM Plex Mono', monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#87868e';
        ctx.fillText('LEGEND', x, y + 10);
        let cx = x;
        const cy = y + 38;
        for (const item of items) {
          ctx.strokeStyle = item.key === 'uses' ? '#87868e' : item.key === 'guardrail' ? '#991b1b' : item.key === 'team' ? '#87868e' : '#18181c';
          ctx.lineWidth = 1.5;
          if (item.key === 'team' || item.key === 'boundary' || item.key === 'guardrail') {
            ctx.setLineDash(item.key === 'team' ? [6, 4] : []);
            if (item.key === 'guardrail') {
              ctx.fillStyle = '#fef2f2';
              ctx.beginPath();
              ctx.roundRect(cx, cy - 8, 30, 16, 3);
              ctx.fill();
            }
            ctx.beginPath();
            ctx.roundRect(cx, cy - 8, 30, 16, item.key === 'boundary' ? 5 : 3);
            ctx.stroke();
          } else {
            ctx.setLineDash(item.key === 'approval' ? [7, 5] : item.key === 'uses' ? [2, 4] : []);
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + 30, cy);
            ctx.stroke();
            if (item.key !== 'uses') {
              ctx.setLineDash([]);
              ctx.beginPath();
              ctx.moveTo(cx + 30, cy);
              ctx.lineTo(cx + 23, cy - 4);
              ctx.moveTo(cx + 30, cy);
              ctx.lineTo(cx + 23, cy + 4);
              ctx.stroke();
            }
          }
          ctx.setLineDash([]);
          ctx.fillStyle = '#5a5a62';
          ctx.fillText(item.text, cx + 40, cy);
          cx += 40 + ctx.measureText(item.text).width + 28;
        }
        ctx.restore();
        break;
      }

      case 'connector': {
        // An orthogonal route, drawn progressively along its length.
        if (points.length < 2) break;
        const segs: number[] = [];
        let total = 0;
        for (let i = 1; i < points.length; i++) {
          const d = Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
          segs.push(d);
          total += d;
        }
        let remaining = total * clampedProgress;
        const dash = element.lineStyle === 'dashed' ? [9, 6] : element.lineStyle === 'dotted' ? [2, 5] : [];
        ctx.save();
        ctx.strokeStyle = strokeColor || '#18181c';
        ctx.lineWidth = element.lineStyle === 'dotted' ? 1.6 : 1.8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        let tip = points[0];
        let prev = points[0];
        for (let i = 1; i < points.length && remaining > 0; i++) {
          const step = Math.min(segs[i - 1], remaining);
          const f = segs[i - 1] ? step / segs[i - 1] : 1;
          tip = { x: points[i - 1].x + (points[i].x - points[i - 1].x) * f, y: points[i - 1].y + (points[i].y - points[i - 1].y) * f };
          prev = points[i - 1];
          ctx.lineTo(tip.x, tip.y);
          remaining -= step;
        }
        ctx.stroke();
        ctx.setLineDash([]);
        currentTip = tip;

        if (element.arrowHead && clampedProgress > 0.9) {
          const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
          const head = 10;
          ctx.beginPath();
          ctx.moveTo(tip.x, tip.y);
          ctx.lineTo(tip.x - head * Math.cos(angle - Math.PI / 7), tip.y - head * Math.sin(angle - Math.PI / 7));
          ctx.moveTo(tip.x, tip.y);
          ctx.lineTo(tip.x - head * Math.cos(angle + Math.PI / 7), tip.y - head * Math.sin(angle + Math.PI / 7));
          ctx.stroke();
        }

        if (label && clampedProgress > 0.7) {
          // the label sits on the longest segment
          let best = 1;
          for (let i = 2; i < points.length; i++) if (segs[i - 1] > segs[best - 1]) best = i;
          const mx = (points[best - 1].x + points[best].x) / 2;
          const my = (points[best - 1].y + points[best].y) / 2;
          ctx.font = `500 12px 'IBM Plex Mono', monospace`;
          const tw = ctx.measureText(label).width;
          ctx.fillStyle = '#fafafa';
          ctx.strokeStyle = '#e2e2e6';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(mx - tw / 2 - 6, my - 10, tw + 12, 20, 4);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#5a5a62';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, mx, my);
        }
        ctx.restore();
        break;
      }


      case 'rectangle': {
        // --- SMART AUTO-SIZING & TEXT WRAPPING FOR AGENT CARDS ---
        const rawLabel = label || text || '';
        const rawSubtext = subtext || '';

        // Measure text with target fonts
        const labelFontSize = Math.max(13, Math.min(15, fontSize || 14));
        ctx.font = `600 ${labelFontSize}px 'Karla', sans-serif`;

        // Calculate maximum allowed width inside original or expanded box
        const maxContentWidth = Math.max(width - 28, 140);
        const labelLines = wrapTextLines(ctx, rawLabel, maxContentWidth);

        ctx.font = `400 11.5px 'IBM Plex Mono', monospace`;
        const subtextLines = wrapTextLines(ctx, rawSubtext, maxContentWidth);

        // Measure line widths to determine if the box needs auto-expansion
        ctx.font = `600 ${labelFontSize}px 'Karla', sans-serif`;
        let maxLabelW = 0;
        for (const l of labelLines) {
          const lw = ctx.measureText(l).width;
          if (lw > maxLabelW) maxLabelW = lw;
        }

        ctx.font = `400 11.5px 'IBM Plex Mono', monospace`;
        let maxSubW = 0;
        for (const s of subtextLines) {
          const sw = ctx.measureText(s).width;
          if (sw > maxSubW) maxSubW = sw;
        }

        const neededWidth = Math.max(maxLabelW + 36, maxSubW + 36, 150);
        const renderWidth = Math.max(width, neededWidth);

        const labelBlockHeight = labelLines.length * (labelFontSize * 1.3);
        const subtextBlockHeight = subtextLines.length > 0 ? (subtextLines.length * 15 + 6) : 0;
        const topBadgePad = agentRole ? 14 : 6;
        const neededHeight = labelBlockHeight + subtextBlockHeight + topBadgePad + 28;
        const renderHeight = Math.max(height, neededHeight);

        // Adjust position so expansion occurs symmetrically around original center
        const renderX = x - (renderWidth - width) / 2;
        const renderY = y - (renderHeight - height) / 2;

        // 1. OPAQUE SOLID BACKGROUND MASK
        // This completely prevents connecting arrows / lines from passing underneath and conflicting with text!
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(renderX, renderY, renderWidth, renderHeight);

        // 2. Render rough card outline with fill tint
        const cardFill = agentRole === 'router' || agentRole === 'manager'
          ? 'rgba(200, 241, 58, 0.25)'
          : agentRole === 'guardrail'
          ? 'rgba(254, 226, 226, 0.4)'
          : agentRole === 'memory' || agentRole === 'knowledge'
          ? 'rgba(224, 231, 255, 0.45)'
          : agentRole === 'approval' || agentRole === 'human_approval'
          ? 'rgba(254, 243, 199, 0.5)'
          : agentRole === 'system'
          ? 'rgba(200, 241, 58, 0.22)'
          : agentRole === 'actor' || agentRole === 'external' || agentRole === 'resource' || agentRole === 'resource_reused'
          ? '#ffffff'
          : fillColor || 'rgba(244, 244, 247, 0.85)';

        const cardOptions = {
          ...options,
          fill: cardFill,
          fillStyle: 'solid',
        };

        if (clampedProgress >= 0.99) {
          rc.rectangle(renderX, renderY, renderWidth, renderHeight, cardOptions);
          currentTip = { x: renderX + renderWidth, y: renderY + renderHeight };
        } else {
          // Draw edges progressively around the fitted bounds
          const p1 = { x: renderX, y: renderY };
          const p2 = { x: renderX + renderWidth, y: renderY };
          const p3 = { x: renderX + renderWidth, y: renderY + renderHeight };
          const p4 = { x: renderX, y: renderY + renderHeight };

          const perimeter = 2 * (renderWidth + renderHeight);
          const currentLen = perimeter * clampedProgress;

          if (currentLen <= renderWidth) {
            const frac = currentLen / renderWidth;
            const endX = renderX + renderWidth * frac;
            rc.line(p1.x, p1.y, endX, renderY, cardOptions);
            currentTip = { x: endX, y: renderY };
          } else if (currentLen <= renderWidth + renderHeight) {
            rc.line(p1.x, p1.y, p2.x, p2.y, cardOptions);
            const frac = (currentLen - renderWidth) / renderHeight;
            const endY = renderY + renderHeight * frac;
            rc.line(p2.x, p2.y, p2.x, endY, cardOptions);
            currentTip = { x: p2.x, y: endY };
          } else if (currentLen <= 2 * renderWidth + renderHeight) {
            rc.line(p1.x, p1.y, p2.x, p2.y, cardOptions);
            rc.line(p2.x, p2.y, p3.x, p3.y, cardOptions);
            const frac = (currentLen - (renderWidth + renderHeight)) / renderWidth;
            const endX = p3.x - renderWidth * frac;
            rc.line(p3.x, p3.y, endX, p3.y, cardOptions);
            currentTip = { x: endX, y: p3.y };
          } else {
            rc.line(p1.x, p1.y, p2.x, p2.y, cardOptions);
            rc.line(p2.x, p2.y, p3.x, p3.y, cardOptions);
            rc.line(p3.x, p3.y, p4.x, p4.y, cardOptions);
            const frac = (currentLen - (2 * renderWidth + renderHeight)) / renderHeight;
            const endY = p4.y - renderHeight * frac;
            rc.line(p4.x, p4.y, p4.x, endY, cardOptions);
            currentTip = { x: p4.x, y: endY };
          }
        }

        // 3. Role Badge (placed neatly at top edge of card)
        if (agentRole && clampedProgress > 0.4) {
          drawRoleBadge(ctx, renderX + 10, renderY - 9, agentRole);
        }

        // 4. Render multiline label and subtext with balanced vertical centering
        if (rawLabel && clampedProgress > 0.5) {
          const centerX = renderX + renderWidth / 2;
          const totalContentHeight = labelBlockHeight + subtextBlockHeight;
          const startContentY = renderY + (renderHeight - totalContentHeight) / 2 + (agentRole ? 5 : 0);

          // Draw Label lines
          ctx.fillStyle = strokeColor || '#18181c';
          ctx.font = `600 ${labelFontSize}px 'Karla', sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          const labelLineStep = labelFontSize * 1.3;
          labelLines.forEach((l, idx) => {
            const lineY = startContentY + idx * labelLineStep + labelFontSize / 2;
            ctx.fillText(l, centerX, lineY);
          });

          // Draw Subtext lines
          if (subtextLines.length > 0) {
            ctx.font = `400 11.5px 'IBM Plex Mono', monospace`;
            ctx.fillStyle = '#5a5a62';
            const subtextStartY = startContentY + labelBlockHeight + 6;
            subtextLines.forEach((s, idx) => {
              const lineY = subtextStartY + idx * 15 + 6;
              ctx.fillText(s, centerX, lineY);
            });
          }
        }
        break;
      }

      case 'circle': {
        const diameter = Math.max(Math.abs(width), Math.abs(height));
        const radius = diameter / 2;
        const centerX = x + radius;
        const centerY = y + radius;

        // Opaque background mask
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fill();

        if (clampedProgress >= 0.99) {
          rc.circle(centerX, centerY, diameter, options);
          currentTip = { x: centerX + radius, y: centerY };
        } else {
          const angle = 2 * Math.PI * clampedProgress;
          const arcPoints: [number, number][] = [];
          const steps = Math.max(8, Math.floor(40 * clampedProgress));
          for (let i = 0; i <= steps; i++) {
            const a = (i / steps) * angle;
            arcPoints.push([
              centerX + radius * Math.cos(a),
              centerY + radius * Math.sin(a)
            ]);
          }
          if (arcPoints.length >= 2) {
            rc.curve(arcPoints, options);
            const last = arcPoints[arcPoints.length - 1];
            currentTip = { x: last[0], y: last[1] };
          }
        }

        if (label && clampedProgress > 0.6) {
          const rawLabel = label || '';
          ctx.font = `600 ${Math.max(12, Math.min(15, fontSize))}px 'Karla', sans-serif`;
          const lines = wrapTextLines(ctx, rawLabel, diameter * 0.75);
          const lineStep = 17;
          const startY = centerY - ((lines.length - 1) * lineStep) / 2;

          ctx.fillStyle = strokeColor || '#18181c';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          lines.forEach((l, idx) => {
            ctx.fillText(l, centerX, startY + idx * lineStep);
          });
        }
        break;
      }

      case 'ellipse': {
        const centerX = x + width / 2;
        const centerY = y + height / 2;

        // Opaque mask
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, Math.abs(width) / 2, Math.abs(height) / 2, 0, 0, 2 * Math.PI);
        ctx.fill();

        if (clampedProgress >= 0.99) {
          rc.ellipse(centerX, centerY, Math.abs(width), Math.abs(height), options);
          currentTip = { x: centerX + width / 2, y: centerY };
        } else {
          const angle = 2 * Math.PI * clampedProgress;
          const arcPoints: [number, number][] = [];
          const steps = Math.max(8, Math.floor(40 * clampedProgress));
          for (let i = 0; i <= steps; i++) {
            const a = (i / steps) * angle;
            arcPoints.push([
              centerX + (Math.abs(width) / 2) * Math.cos(a),
              centerY + (Math.abs(height) / 2) * Math.sin(a)
            ]);
          }
          if (arcPoints.length >= 2) {
            rc.curve(arcPoints, options);
            const last = arcPoints[arcPoints.length - 1];
            currentTip = { x: last[0], y: last[1] };
          }
        }
        if (label && clampedProgress > 0.6) {
          ctx.fillStyle = strokeColor || '#18181c';
          ctx.font = `600 ${Math.max(12, Math.min(15, fontSize))}px 'Karla', sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const lines = wrapTextLines(ctx, label, width * 0.75);
          const lineStep = 16;
          const startY = centerY - ((lines.length - 1) * lineStep) / 2;
          lines.forEach((l, idx) => {
            ctx.fillText(l, centerX, startY + idx * lineStep);
          });
        }
        break;
      }

      case 'line': {
        const x1 = x;
        const y1 = y;
        const x2 = x + width;
        const y2 = y + height;
        const curX = x1 + (x2 - x1) * clampedProgress;
        const curY = y1 + (y2 - y1) * clampedProgress;
        rc.line(x1, y1, curX, curY, options);
        currentTip = { x: curX, y: curY };
        break;
      }

      case 'arrow': {
        const x1 = x;
        const y1 = y;
        const x2 = x + width;
        const y2 = y + height;
        const curX = x1 + (x2 - x1) * clampedProgress;
        const curY = y1 + (y2 - y1) * clampedProgress;
        rc.line(x1, y1, curX, curY, options);
        currentTip = { x: curX, y: curY };

        // If line is almost complete, draw arrowhead
        if (clampedProgress > 0.75) {
          const headProgress = (clampedProgress - 0.75) / 0.25;
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const headLength = 15 * headProgress;
          const arrowAngle = Math.PI / 6;

          const a1x = curX - headLength * Math.cos(angle - arrowAngle);
          const a1y = curY - headLength * Math.sin(angle - arrowAngle);
          const a2x = curX - headLength * Math.cos(angle + arrowAngle);
          const a2y = curY - headLength * Math.sin(angle + arrowAngle);

          rc.line(curX, curY, a1x, a1y, options);
          rc.line(curX, curY, a2x, a2y, options);
        }

        // Arrow label with clean background chip to prevent line collision
        if (label && clampedProgress > 0.7) {
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          ctx.font = `500 13px 'IBM Plex Mono', monospace`;
          const textW = ctx.measureText(label).width;

          // Mask pill behind arrow label
          ctx.fillStyle = '#fafafa';
          ctx.strokeStyle = '#e2e2e6';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(midX - textW / 2 - 6, midY - 18, textW + 12, 18, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = strokeColor || '#5a5a62';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, midX, midY - 9);
        }
        break;
      }

      case 'diamond': {
        const safeW = Math.max(width, 130);
        const safeH = Math.max(height, 80);
        const top = [x + safeW / 2, y];
        const right = [x + safeW, y + safeH / 2];
        const bottom = [x + safeW / 2, y + safeH];
        const left = [x, y + safeH / 2];
        const poly = [top, right, bottom, left] as [number, number][];

        // Opaque diamond background mask
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(top[0], top[1]);
        ctx.lineTo(right[0], right[1]);
        ctx.lineTo(bottom[0], bottom[1]);
        ctx.lineTo(left[0], left[1]);
        ctx.closePath();
        ctx.fill();

        if (clampedProgress >= 0.99) {
          rc.polygon(poly, options);
          currentTip = { x: left[0], y: left[1] };
        } else {
          const pts = [top, right, bottom, left, top];
          const totalEdges = 4;
          const edgeProgress = clampedProgress * totalEdges;
          const curEdge = Math.floor(edgeProgress);
          const edgeFrac = edgeProgress - curEdge;

          for (let i = 0; i < curEdge; i++) {
            rc.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], options);
          }
          if (curEdge < 4) {
            const start = pts[curEdge];
            const next = pts[curEdge + 1];
            const endX = start[0] + (next[0] - start[0]) * edgeFrac;
            const endY = start[1] + (next[1] - start[1]) * edgeFrac;
            rc.line(start[0], start[1], endX, endY, options);
            currentTip = { x: endX, y: endY };
          }
        }

        if (label && clampedProgress > 0.6) {
          ctx.fillStyle = strokeColor || '#18181c';
          ctx.font = `600 ${Math.max(12, Math.min(14, fontSize))}px 'Karla', sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const lines = wrapTextLines(ctx, label, safeW * 0.6);
          const lineStep = 16;
          const startY = y + safeH / 2 - ((lines.length - 1) * lineStep) / 2;
          lines.forEach((l, idx) => {
            ctx.fillText(l, x + safeW / 2, startY + idx * lineStep);
          });
        }
        break;
      }

      case 'cylinder': {
        // Shared Memory / Database / Knowledge Storage
        const rawLabel = label || text || 'Database';
        const rawSub = subtext || '';

        ctx.font = `600 ${Math.max(12, Math.min(14, fontSize))}px 'Karla', sans-serif`;
        const labelLines = wrapTextLines(ctx, rawLabel, Math.max(width - 32, 130));

        ctx.font = `400 11px 'IBM Plex Mono', monospace`;
        const subLines = wrapTextLines(ctx, rawSub, Math.max(width - 32, 130));

        let maxW = 0;
        ctx.font = `600 ${Math.max(12, Math.min(14, fontSize))}px 'Karla', sans-serif`;
        labelLines.forEach(l => { const w = ctx.measureText(l).width; if (w > maxW) maxW = w; });
        ctx.font = `400 11px 'IBM Plex Mono', monospace`;
        subLines.forEach(s => { const w = ctx.measureText(s).width; if (w > maxW) maxW = w; });

        const renderW = Math.max(width, maxW + 44, 150);
        const textBlockHeight = labelLines.length * 16 + (subLines.length > 0 ? subLines.length * 14 + 4 : 0);
        const renderH = Math.max(height, textBlockHeight + 56, 85);
        const renderX = x - (renderW - width) / 2;
        const renderY = y - (renderH - height) / 2;

        const r = renderW / 2;
        const topY = renderY + 14;
        const botY = renderY + renderH - 14;

        // 1. OPAQUE CYLINDER MASK
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(renderX, topY, renderW, botY - topY);
        ctx.beginPath();
        ctx.ellipse(renderX + r, topY, r, 13, 0, 0, 2 * Math.PI);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(renderX + r, botY, r, 13, 0, 0, Math.PI);
        ctx.fill();

        // 2. Rough outlines
        const cylOptions = {
          ...options,
          fill: fillColor || 'rgba(224, 231, 255, 0.4)',
          fillStyle: 'solid',
        };

        rc.ellipse(renderX + r, topY, renderW, 26, cylOptions);
        rc.line(renderX, topY, renderX, botY, cylOptions);
        rc.line(renderX + renderW, topY, renderX + renderW, botY, cylOptions);
        rc.arc(renderX + r, botY, renderW, 26, 0, Math.PI, false, cylOptions);
        currentTip = { x: renderX + renderW, y: botY };

        // 3. Centered Text safely in middle cylinder section
        if (rawLabel && clampedProgress > 0.6) {
          const bodyCenterY = topY + (botY - topY) / 2;
          const startY = bodyCenterY - textBlockHeight / 2 + 8;

          ctx.fillStyle = strokeColor || '#18181c';
          ctx.font = `600 ${Math.max(12, Math.min(14, fontSize))}px 'Karla', sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          labelLines.forEach((l, idx) => {
            ctx.fillText(l, renderX + r, startY + idx * 16);
          });

          if (subLines.length > 0) {
            ctx.font = `400 11px 'IBM Plex Mono', monospace`;
            ctx.fillStyle = '#5a5a62';
            const subStartY = startY + labelLines.length * 16 + 4;
            subLines.forEach((s, idx) => {
              ctx.fillText(s, renderX + r, subStartY + idx * 14);
            });
          }
        }
        break;
      }

      case 'sticky': {
        // Sticky note / Architect thought
        rc.rectangle(x, y, width, height, {
          ...options,
          fill: fillColor || '#fef08a',
          fillStyle: 'solid',
          stroke: strokeColor || '#ca8a04',
          strokeWidth: 1.5,
        });
        currentTip = { x: x + width, y: y + height };

        if (label && clampedProgress > 0.6) {
          ctx.fillStyle = '#854d0e';
          ctx.font = `400 16px 'Nanum Pen Script', cursive, sans-serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          const lines = wrapTextLines(ctx, label, width - 24);
          lines.forEach((l, idx) => {
            ctx.fillText(l, x + 12, y + 10 + idx * 18);
          });
        }
        break;
      }

      default: {
        rc.rectangle(x, y, width, height, options);
        currentTip = { x: x + width, y: y + height };
      }
    }
  } else if (type === 'text') {
    const fullText = text || label || '';

    if (!fullText) {
      if (width || height) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = strokeColor || '#18181c';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, width || 120, height || 40);
        ctx.restore();
      }
      return { currentTip: null };
    }

    const charCount = Math.max(1, Math.floor(fullText.length * clampedProgress));
    const visibleText = fullText.slice(0, charCount);
    const actualFontSize = fontSize || 28;

    ctx.font = `400 ${actualFontSize}px 'Nanum Pen Script', cursive, sans-serif`;
    ctx.textBaseline = 'top';
    const lines = visibleText.split('\n');
    const lineHeight = actualFontSize * 1.05;

    // Background card / sticky note if fillColor provided
    if (fillColor && fillColor !== 'transparent') {
      let maxLineWidth = 0;
      lines.forEach((l) => {
        const m = ctx.measureText(l);
        if (m.width > maxLineWidth) maxLineWidth = m.width;
      });
      const textWidth = Math.max(maxLineWidth + 24, width || 120);
      const textHeight = Math.max(lines.length * lineHeight + 16, height || 50);

      // Opaque mask
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 8, y - 6, textWidth, textHeight);

      rc.rectangle(x - 8, y - 6, textWidth, textHeight, {
        seed,
        roughness: 1.1,
        fill: fillColor,
        fillStyle: 'solid',
        stroke: strokeColor,
        strokeWidth: 1.5,
      });
    }

    lines.forEach((line, idx) => {
      const lineY = y + idx * lineHeight;
      if (!fillColor || fillColor === 'transparent') {
        // Protective paper halo behind characters to keep text crisp over background lines
        ctx.strokeStyle = '#fafafa';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeText(line, x, lineY);
      }

      ctx.fillStyle = strokeColor || '#18181c';
      ctx.fillText(line, x, lineY);
    });

    const lastLine = lines[lines.length - 1] || '';
    const lastMetrics = ctx.measureText(lastLine);
    currentTip = { x: x + lastMetrics.width + 4, y: y + (lines.length - 0.5) * lineHeight };
  } else if (type === 'image') {
    // Teolima Iconic On-Brand Hand-Drawn Sketch Illustration
    const cardW = width || 270;
    const cardH = height || 230;
    const cx = x + cardW / 2;
    const cy = y + cardH / 2;

    // Subtle pleasing motion curve: smooth ease-out spring
    const easeProgress = 1 - Math.pow(1 - clampedProgress, 3);
    const scale = 0.94 + 0.06 * easeProgress;
    const floatY = (1 - easeProgress) * 10;
    const opacity = Math.min(1.0, clampedProgress * 1.35);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy + floatY);
    ctx.globalAlpha = opacity;

    // 1. Soft paper card shadow
    ctx.fillStyle = 'rgba(24, 24, 28, 0.06)';
    ctx.beginPath();
    ctx.roundRect(x + 4, y + 6, cardW, cardH, 8);
    ctx.fill();

    // 2. Opaque card mask
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, cardH, 6);
    ctx.fill();

    // 3. Hand-drawn Rough.js polaroid frame
    rc.rectangle(x, y, cardW, cardH, {
      seed,
      roughness: 1.2,
      stroke: strokeColor || '#18181c',
      strokeWidth: Math.max(1.5, strokeWidth || 1.8),
      fill: '#ffffff',
      fillStyle: 'solid',
    });

    // 4. Image viewport inside frame
    const padX = 12;
    const padTop = 14;
    const imgW = cardW - padX * 2;
    const imgH = cardH - 66;
    const imgX = x + padX;
    const imgY = y + padTop;

    // Inner sketch border
    rc.rectangle(imgX, imgY, imgW, imgH, {
      seed: seed + 3,
      roughness: 0.9,
      stroke: '#e2e2e6',
      strokeWidth: 1,
    });

    const cachedImg = element.imageUrl ? getCachedImage(element.imageUrl) : null;
    if (cachedImg) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(imgX + 1, imgY + 1, imgW - 2, imgH - 2, 4);
      ctx.clip();

      // Aspect-fit cover
      const imgRatio = cachedImg.naturalWidth / cachedImg.naturalHeight;
      const winRatio = imgW / imgH;
      let sx = 0, sy = 0, sWidth = cachedImg.naturalWidth, sHeight = cachedImg.naturalHeight;

      if (imgRatio > winRatio) {
        sWidth = cachedImg.naturalHeight * winRatio;
        sx = (cachedImg.naturalWidth - sWidth) / 2;
      } else {
        sHeight = cachedImg.naturalWidth / winRatio;
        sy = (cachedImg.naturalHeight - sHeight) / 2;
      }

      ctx.drawImage(cachedImg, sx, sy, sWidth, sHeight, imgX, imgY, imgW, imgH);

      // Subtle on-brand watercolor paper blend
      ctx.fillStyle = 'rgba(250, 250, 250, 0.04)';
      ctx.fillRect(imgX, imgY, imgW, imgH);
      ctx.restore();
    } else {
      // Loading placeholder card with animated shimmer
      ctx.save();
      ctx.fillStyle = 'rgba(245, 245, 247, 0.95)';
      ctx.beginPath();
      ctx.roundRect(imgX, imgY, imgW, imgH, 4);
      ctx.fill();

      ctx.font = `500 12px 'IBM Plex Mono', monospace`;
      ctx.fillStyle = '#5a5a62';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✨ Sketching on-brand visual...', imgX + imgW / 2, imgY + imgH / 2);
      ctx.restore();
    }

    // 5. Brand masking tape in Volt joy accent (#c8f13a)
    const tapeW = 56;
    const tapeH = 15;
    const tapeX = x + cardW / 2 - tapeW / 2;
    const tapeY = y - 7;

    rc.rectangle(tapeX, tapeY, tapeW, tapeH, {
      seed: seed + 5,
      roughness: 1.3,
      fill: 'rgba(200, 241, 58, 0.9)',
      fillStyle: 'solid',
      stroke: '#18181c',
      strokeWidth: 1.1,
    });

    ctx.font = `700 9px 'IBM Plex Mono', monospace`;
    ctx.fillStyle = '#18181c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡ AI SKETCH', tapeX + tapeW / 2, tapeY + 8);

    // 6. Handwritten caption with hand-drawn accent underline
    const caption = element.imageCaption || element.label || element.text || 'System Workflow Sketch';
    ctx.font = `400 20px 'Nanum Pen Script', cursive, sans-serif`;
    ctx.fillStyle = '#18181c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const capY = y + cardH - 26;
    ctx.fillText(caption, x + cardW / 2, capY);

    // Wavy volt underline beneath caption
    rc.line(x + cardW / 2 - 50, capY + 12, x + cardW / 2 + 50, capY + 12, {
      seed: seed + 7,
      roughness: 1.4,
      stroke: 'rgba(200, 241, 58, 0.9)',
      strokeWidth: 2.2,
    });

    if (clampedProgress < 1.0) {
      currentTip = { x: x + cardW, y: y + cardH };
    }

    ctx.restore();
  }

  ctx.restore();
  return { currentTip };
}

/**
 * Role badge renderer on top of agent cards
 */
function drawRoleBadge(ctx: CanvasRenderingContext2D, badgeX: number, badgeY: number, role: string) {
  ctx.save();
  let bg = '#18181c';
  let textCol = '#ffffff';
  const LABELS: Record<string, string> = { actor: 'PERSON', system: 'THIS SYSTEM', external: 'EXTERNAL SYSTEM', resource: 'AZURE', resource_reused: 'FROM PLATFORM' };
  let label = LABELS[role] ?? role.toUpperCase();

  if (role === 'router' || role === 'manager') {
    bg = '#c8f13a';
    textCol = '#18181c';
  } else if (role === 'knowledge') {
    bg = '#e0e7ff';
    textCol = '#3730a3';
  } else if (role === 'approval') {
    bg = '#fef3c7';
    textCol = '#92400e';
  } else if (role === 'output') {
    bg = '#ffffff';
    textCol = '#18181c';
  } else if (role === 'tool') {
    bg = '#e2e2e6';
    textCol = '#18181c';
  } else if (role === 'guardrail') {
    bg = '#fee2e2';
    textCol = '#991b1b';
  } else if (role === 'memory') {
    bg = '#e0e7ff';
    textCol = '#3730a3';
  } else if (role === 'intake') {
    bg = '#18181c';
    textCol = '#ffffff';
  } else if (role === 'human_approval') {
    bg = '#fef3c7';
    textCol = '#92400e';
  } else if (role === 'actor' || role === 'external' || role === 'resource_reused') {
    bg = '#ffffff';
    textCol = '#5a5a62';
  } else if (role === 'resource') {
    bg = '#ffffff';
    textCol = '#18181c';
  }

  ctx.font = `600 10px 'IBM Plex Mono', monospace`;
  const w = ctx.measureText(label).width + 14;
  
  // Clean shadow/contrast border
  ctx.fillStyle = bg;
  ctx.strokeStyle = '#18181c';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, w, 18, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = textCol;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, badgeX + w / 2, badgeY + 9);
  ctx.restore();
}

/**
 * Draws the active Teolima Drawing Pen indicator at the cursor point
 */
export function renderDrawingCursor(
  ctx: CanvasRenderingContext2D,
  tip: Point,
  author: 'ai' | 'user' = 'ai',
  label: string = 'Drawing...'
) {
  ctx.save();
  ctx.translate(tip.x, tip.y);

  // Pen body angle
  ctx.rotate(-Math.PI / 4);

  // Pen Tip
  ctx.fillStyle = '#18181c';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-4, -8);
  ctx.lineTo(4, -8);
  ctx.closePath();
  ctx.fill();

  // Wood / Barrel Cone
  ctx.fillStyle = '#f5f5f7';
  ctx.beginPath();
  ctx.moveTo(-4, -8);
  ctx.lineTo(4, -8);
  ctx.lineTo(5, -22);
  ctx.lineTo(-5, -22);
  ctx.closePath();
  ctx.fill();

  // Pen Shaft (Volt joy accent for AI coach, ink dark for user)
  ctx.fillStyle = author === 'ai' ? '#c8f13a' : '#18181c';
  ctx.fillRect(-5, -44, 10, 22);

  // Cap / Finial
  ctx.fillStyle = '#18181c';
  ctx.fillRect(-5, -50, 10, 6);

  ctx.restore();

  // Draw animated pulse ripple at tip
  const now = performance.now() / 220;
  const rippleRadius = 5 + (Math.sin(now) + 1) * 3;
  ctx.save();
  ctx.strokeStyle = author === 'ai' ? 'rgba(200, 241, 58, 0.9)' : 'rgba(24, 24, 28, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, rippleRadius, 0, 2 * Math.PI);
  ctx.stroke();

  // Sleek Teolima floating badge
  ctx.fillStyle = author === 'ai' ? '#18181c' : '#ffffff';
  ctx.strokeStyle = '#18181c';
  ctx.lineWidth = 1;
  ctx.font = `500 11px 'IBM Plex Mono', monospace`;
  const tag = author === 'ai' ? `⚡ Teolima Coach (${label})` : '✏️ You (Sketching)';
  const tagWidth = ctx.measureText(tag).width + 18;
  
  ctx.beginPath();
  ctx.roundRect(tip.x + 14, tip.y - 12, tagWidth, 24, 6);
  ctx.fill();
  if (author !== 'ai') ctx.stroke();

  ctx.fillStyle = author === 'ai' ? '#c8f13a' : '#18181c';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(tag, tip.x + 23, tip.y);

  ctx.restore();
}

/**
 * Draws Teolima paper canvas backgrounds
 */
export function renderCanvasBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: 'paper' | 'paper-dots' | 'paper-grid' | 'blueprint' | 'darkboard' = 'paper-dots',
  viewTransform: { x: number; y: number; scale: number }
) {
  // Background base fill (Paper default #fafafa)
  switch (theme) {
    case 'blueprint':
      ctx.fillStyle = '#0f172a';
      break;
    case 'darkboard':
      ctx.fillStyle = '#1c1c22';
      break;
    case 'paper':
    case 'paper-dots':
    case 'paper-grid':
    default:
      ctx.fillStyle = '#fafafa'; // Teolima pristine paper
      break;
  }
  ctx.fillRect(0, 0, width, height);

  // If theme is clean paper, skip patterns
  if (theme === 'paper') return;

  // Grid/Dots in transformed space
  ctx.save();
  ctx.translate(viewTransform.x, viewTransform.y);
  ctx.scale(viewTransform.scale, viewTransform.scale);

  // Visible viewport bounding box in world coordinates
  const left = -viewTransform.x / viewTransform.scale;
  const top = -viewTransform.y / viewTransform.scale;
  const right = (width - viewTransform.x) / viewTransform.scale;
  const bottom = (height - viewTransform.y) / viewTransform.scale;

  const gridSize = 28;
  const startX = Math.floor(left / gridSize) * gridSize;
  const endX = Math.ceil(right / gridSize) * gridSize;
  const startY = Math.floor(top / gridSize) * gridSize;
  const endY = Math.ceil(bottom / gridSize) * gridSize;

  if (theme === 'paper-dots') {
    ctx.fillStyle = 'rgba(24, 24, 28, 0.13)';
    for (let x = startX; x <= endX; x += gridSize) {
      for (let y = startY; y <= endY; y += gridSize) {
        ctx.beginPath();
        ctx.arc(x, y, 1.1 / Math.max(0.5, viewTransform.scale), 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  } else if (theme === 'paper-grid') {
    ctx.strokeStyle = 'rgba(24, 24, 28, 0.08)';
    ctx.lineWidth = 1 / viewTransform.scale;
    ctx.beginPath();
    for (let x = startX; x <= endX; x += gridSize) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();
  } else if (theme === 'blueprint') {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 1 / viewTransform.scale;
    ctx.beginPath();
    for (let x = startX; x <= endX; x += gridSize) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();
  } else if (theme === 'darkboard') {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    for (let x = startX; x <= endX; x += gridSize) {
      for (let y = startY; y <= endY; y += gridSize) {
        ctx.beginPath();
        ctx.arc(x, y, 1.0 / Math.max(0.5, viewTransform.scale), 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }

  ctx.restore();
}
