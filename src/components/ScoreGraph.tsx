'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useSessionStore } from '@/lib/store';

/**
 * Real-time score line graph drawn on canvas.
 * Y-axis: ratingConfig.min (bottom) to ratingConfig.max (top)
 * X-axis: 0 to totalDuration (seconds), no negatives
 * Smooth bezier curve through visited data points.
 */
export default function ScoreGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    timelineEvents,
    ratings,
    visitedEvents,
    guidedRatings,
    currentEventIndex,
    totalDuration,
    dimensions,
    activeDimensionIndex,
  } = useSessionStore();

  // TODO: uncomment this for future uncomment
  // const activeDim = dimensions[activeDimensionIndex] || { name: 'Emotion', min: -1, max: 1, step: 0.1 };
  const activeDim = dimensions[activeDimensionIndex] || { name: 'Valence', min: -1, max: 1, step: 0.1 };
  const activeDimName = activeDim.name;
  const ratingConfig = activeDim;
  const activeRatings = ratings[activeDimName] || [];
  const activeVisitedEvents = visitedEvents[activeDimName] || new Set<number>();
  const activeGuidedRatings = guidedRatings[activeDimName] || [];

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    // Padding
    const padLeft = 44;
    const padRight = 16;
    const padTop = 16;
    const padBottom = 28;
    const plotW = W - padLeft - padRight;
    const plotH = H - padTop - padBottom;

    // Clear
    ctx.clearRect(0, 0, W, H);

    let min = ratingConfig.min;
    let max = ratingConfig.max;

    // For RankTrace or huge limits, dynamically adapt min/max based on actual ratings to show local window
    if (ratingConfig.traceType === 'RankTrace' || min <= -1e10 || max >= 1e10) {
      const ratedValues = activeRatings.filter((_, i) => activeVisitedEvents.has(i));
      const minRated = ratedValues.length > 0 ? Math.min(...ratedValues) : 0;
      const maxRated = ratedValues.length > 0 ? Math.max(...ratedValues) : 0;
      const currentRating = activeRatings[currentEventIndex] ?? 0;

      let lowest = Math.min(minRated, currentRating);
      let highest = Math.max(maxRated, currentRating);

      if (activeGuidedRatings.length > 0) {
        const minGuided = Math.min(...activeGuidedRatings);
        const maxGuided = Math.max(...activeGuidedRatings);
        lowest = Math.min(lowest, minGuided);
        highest = Math.max(highest, maxGuided);
      }

      // Centered with a minimum span of 5
      const center = (lowest + highest) / 2;
      const span = Math.max(5, highest - lowest + 2);
      min = center - span / 2;
      max = center + span / 2;
    }

    const range = max - min || 1;

    // Helpers
    const toX = (t: number) => padLeft + (totalDuration > 0 ? (t / totalDuration) * plotW : 0);
    const toY = (v: number) => padTop + plotH - ((v - min) / range) * plotH;

    // --- Grid lines & Y labels ---
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = '11px "SF Mono", "Fira Code", monospace';

    const step = ratingConfig.step || 0.1;
    const rawSteps = range / step;
    let tickInterval = step;

    if (rawSteps > 20) {
      const ratio = rawSteps / 20;
      const multipliers = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
      const multiplier = multipliers.find(m => m >= ratio) || Math.ceil(ratio);
      tickInterval = step * multiplier;
    }

    const startVal = Math.ceil(min / tickInterval) * tickInterval;
    for (let val = startVal; val <= max + 1e-9; val += tickInterval) {
      const displayVal = Math.round(val * 1000) / 1000;
      const y = toY(displayVal);

      // Skip drawing ticks outside our visual box
      if (y < padTop || y > padTop + plotH) continue;

      // Grid line
      ctx.strokeStyle = displayVal === 0
        ? 'rgba(255,255,255,0.15)'
        : 'rgba(255,255,255,0.05)';
      ctx.lineWidth = displayVal === 0 ? 1.5 : 0.5;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(W - padRight, y);
      ctx.stroke();

      // Y label
      ctx.fillStyle = displayVal === 0
        ? 'rgba(255,255,255,0.6)'
        : 'rgba(255,255,255,0.3)';
      
      const labelText = displayVal > 0 ? `+${displayVal}` : `${displayVal}`;
      ctx.fillText(labelText, padLeft - 8, y);
    }

    // --- X axis labels ---
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '10px "SF Mono", "Fira Code", monospace';

    const xLabelCount = Math.min(6, Math.floor(plotW / 80));
    for (let i = 0; i <= xLabelCount; i++) {
      const t = (i / xLabelCount) * totalDuration;
      const x = toX(t);
      const mins = Math.floor(t / 60);
      const secs = Math.floor(t % 60);
      ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, x, H - padBottom + 8);
    }

    // --- Draw Guided Label Reference Line (Half-Opacity Fade Line) ---
    if (activeGuidedRatings.length > 0 && timelineEvents.length > 0) {
      const guidedPoints: { x: number; y: number }[] = [];
      for (let i = 0; i < timelineEvents.length; i++) {
        const evt = timelineEvents[i];
        const val = activeGuidedRatings[i] ?? 0;
        guidedPoints.push({
          x: toX(evt.relativeTime),
          y: toY(val),
        });
      }

      if (guidedPoints.length >= 2) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(guidedPoints[0].x, guidedPoints[0].y);
        for (let i = 1; i < guidedPoints.length; i++) {
          const prev = guidedPoints[i - 1];
          const curr = guidedPoints[i];
          const cpx = (prev.x + curr.x) / 2;
          ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; // Half opacity fade line
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
      }
    }

    // --- Collect ALL visited points (not limited to currentEventIndex) ---
    const points: { x: number; y: number; rating: number; eventIndex: number }[] = [];
    for (let i = 0; i < timelineEvents.length; i++) {
      if (!activeVisitedEvents.has(i)) continue;
      const evt = timelineEvents[i];
      points.push({
        x: toX(evt.relativeTime),
        y: toY(activeRatings[i] ?? 0),
        rating: activeRatings[i] ?? 0,
        eventIndex: i,
      });
    }

    if (points.length >= 2) {
      // --- Draw gradient fill under curve ---
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);

      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
      }

      // Close to bottom for fill
      const zeroY = toY(0);
      ctx.lineTo(points[points.length - 1].x, zeroY);
      ctx.lineTo(points[0].x, zeroY);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
      grad.addColorStop(0, 'rgba(0, 210, 160, 0.15)');
      grad.addColorStop(0.5, 'rgba(108, 92, 231, 0.05)');
      grad.addColorStop(1, 'rgba(255, 80, 80, 0.15)');
      ctx.fillStyle = grad;
      ctx.fill();
    }

    if (points.length > 0) {
      // --- Draw line ---
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);

      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
      }

      ctx.strokeStyle = '#6c5ce7';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      // --- Draw glow on line ---
      ctx.shadowColor = 'rgba(108, 92, 231, 0.6)';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = 'rgba(108, 92, 231, 0.4)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';

      // --- Draw dots at each visited point ---
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const isActive = p.eventIndex === currentEventIndex;

        // Color based on rating
        let color = 'rgba(255,255,255,0.6)';
        if (p.rating > 0) {
          const t = max > 0 ? Math.min(p.rating / max, 1) : 0;
          color = `hsl(130, ${40 + t * 40}%, ${65 - t * 20}%)`;
        } else if (p.rating < 0) {
          const t = min < 0 ? Math.min(Math.abs(p.rating) / Math.abs(min), 1) : 0;
          color = `hsl(0, ${50 + t * 40}%, ${65 - t * 15}%)`;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, isActive ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        if (isActive) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    // --- Current position vertical line ---
    if (timelineEvents[currentEventIndex]) {
      const cx = toX(timelineEvents[currentEventIndex].relativeTime);
      ctx.strokeStyle = 'rgba(232, 232, 237, 0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cx, padTop);
      ctx.lineTo(cx, padTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [timelineEvents, activeRatings, activeVisitedEvents, activeGuidedRatings, currentEventIndex, totalDuration, ratingConfig]);

  // Redraw on any data change
  useEffect(() => {
    draw();
  }, [draw]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => draw());
    observer.observe(container);
    return () => observer.disconnect();
  }, [draw]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 200,
        position: 'relative',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
}
