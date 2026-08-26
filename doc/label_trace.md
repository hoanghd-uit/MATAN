# Label Trace Preset Plan

## 1. Trace Type Presets

We support three trace type presets, which can be configured per-dimension:

- **GTrace (Bounded and Continuous Trace)**:
  - Definition: `"bounded and continuous trace"`
  - Description: Current default setting. Bounded by a user-specified `Min` and `Max`, changing by a user-specified `Step`.
  - Default values: `min = -1`, `max = 1`, `step = 0.1`.
  - Fields shown: `Min`, `Max`, `Step`.

- **RankTrace (Unbounded and Continuous Trace)**:
  - Definition: `"unbounded and continuous trace"`
  - Description: Unbounded values logic-wise. `Min` is logically capped to a very low float (e.g. `float.MinValue` or safe equivalent, in JS: `Number.MIN_SAFE_INTEGER` / `-1e9`), `Max` is logically capped to a very high float (e.g. `float.MaxValue` or safe equivalent, in JS: `Number.MAX_SAFE_INTEGER` / `1e9`).
  - Fields shown: `Step` only. `Min` and `Max` inputs are hidden.
  - UI Timeline behavior: To avoid display issues on the slider/timeline tick markings, the visible range in value annotation will show at most 20 steps around the current value.

- **BTrace (Binary Trace)**:
  - Definition: `"binary trace"`
  - Description: Strictly binary values. `Min = 0`, `Max = 1`, `Step = 1`.
  - Fields shown: None (all input fields are hidden).

---

## 2. Proposed Changes

### 2.1 Types (`src/types/index.ts`)
Add `traceType` property to the `Dimension` interface:
```typescript
export type TraceType = 'GTrace' | 'RankTrace' | 'BTrace';

export interface Dimension {
  name: string;
  min: number;
  max: number;
  step: number;
  traceType?: TraceType;
}
```

### 2.2 Store (`src/lib/store.ts`)
- Set default `traceType` on dimensions.
- Handle state updates appropriately if user changes preset or values.

### 2.3 Main Page (`src/app/page.tsx`)
- Render a preset selector button group in the Rating Scale section.
- Show definition subtitle matching the chosen preset trace.
- Conditionally render `Min`, `Max`, `Step` inputs based on `traceType`.

### 2.4 Timeline/Slider View (`src/components/SessionView.tsx` / `src/components/ScoreGraph.tsx`)
- Ensure the rating timeline slide view handles the unbounded `RankTrace` safely without displaying hundreds of thousands of ticks (limit timeline value slide view to max 20 steps around the current value).
