# Multi-Agent Continuous Consensus Aggregation
## Theory, Formulation & Implementation Plan — `researcher-voting` Module

> **Scope**: This document serves as both the technical theory reference **and** the step-by-step LLM-friendly implementation plan for integrating three voting consensus algorithms into the `/researcher-voting` page of this Next.js 15 project.

---

## Part 1 — Theory & Mathematical Formulations

### 1.1 Overview & Architecture

When multiple AI agents (or human annotators) evaluate a continuous sequence task — such as frame-by-frame video annotation, step-by-step reasoning quality scores, or continuous sentiment timelines — simple discrete majority voting fails because outputs are real-valued, not categorical.

Continuous aggregation algorithms resolve discrepancies across time-aligned agent traces:

$$Y \in \mathbb{R}^{M \times T}$$

where $M$ is the number of annotators/agents and $T$ is the number of frames (sequence steps).

| Algorithm | Complexity | Primary Assumption | Best Use Case |
| :--- | :--- | :--- | :--- |
| **Soft Voting** (Arithmetic Mean) | $\mathcal{O}(M \cdot T)$ | Equal agent skill; i.i.d. zero-mean noise | Rapid baseline; homogeneous annotators |
| **Weighted Voting** ($\alpha$-Reliability) | $\mathcal{O}(M^2 \cdot T)$ | Reliability correlates with inter-rater agreement $\alpha$ | Heterogeneous annotators with varying accuracy |
| **EWE** (Evaluator Weighted Estimator) | $\mathcal{O}(M \cdot T)$ | Errors are zero-mean with heterogeneous variance $\sigma_i^2$ | Denoising noisy annotator traces |

Let $y_{i,t} \in \mathbb{R}$ be the continuous score assigned by annotator $i \in \{1, \ldots, M\}$ at frame $t \in \{1, \ldots, T\}$.

---

### 1.2 Soft Voting — Arithmetic Mean (Default)

#### Theory
Under the assumption that annotator prediction errors are independent, identically distributed (i.i.d.), and centered at zero ($\mathbb{E}[\epsilon_{i,t}] = 0$), the variance of the aggregated estimate decreases by a factor of $\frac{1}{M}$:

$$\text{Var}(\hat{y}_t) = \frac{\sigma^2}{M}$$

This is the simplest, most interpretable aggregation — give every annotator equal weight.

#### Formula
$$\hat{y}_t^{\text{Soft}} = \frac{1}{M} \sum_{i=1}^{M} y_{i,t}$$

where $M$ is the number of agents reporting at frame $t$.

---

### 1.3 Weighted Voting — alpha-Reliability Weighted

#### Theory
Agents that systematically deviate from cohort consensus are penalized with lower weights, reducing the impact of hallucinating or miscalibrated annotators.

Each annotator's reliability $\alpha_i$ is computed via a **Leave-One-Out (LOO) Krippendorff's alpha** comparison between annotator $i$ and the unweighted cohort mean $\bar{y}_{-i,t}$ (the mean of all other annotators).

#### Formula

**Step 1 — Cohort mean excluding annotator $i$:**
$$\bar{y}_{-i,t} = \frac{1}{M-1} \sum_{j \neq i} y_{j,t}$$

**Step 2 — Leave-One-Out Reliability alpha_i (Interval Distance metric):**
$$D_{o,i} = \frac{1}{T} \sum_{t=1}^{T} (y_{i,t} - \bar{y}_{-i,t})^2 \quad \text{(observed disagreement)}$$

$$D_{e,i} = \frac{1}{2T^2} \sum_{t=1}^{T} \sum_{k=1}^{T} \left[(y_{i,t} - y_{i,k})^2 + (\bar{y}_{-i,t} - \bar{y}_{-i,k})^2\right] \quad \text{(expected disagreement)}$$

$$\alpha_i = 1 - \frac{D_{o,i}}{D_{e,i}}$$

> `alpha_i -> 1`: agent agrees with cohort (high weight)
> `alpha_i -> 0`: random agreement
> `alpha_i < 0`: agent systematically deviates (clamped to 0)

**Step 3 — Normalized weight:**
$$w_i = \frac{\max(0, \alpha_i)}{\sum_{j=1}^{M} \max(0, \alpha_j)}$$

**Step 4 — Weighted aggregate:**
$$\hat{y}_t^{\text{Weighted}} = \sum_{i=1}^{M} w_i \cdot y_{i,t}$$

**Edge case**: If all $\alpha_i \leq 0$, fall back to Soft Voting (uniform weights).

---

### 1.4 EWE — Evaluator Weighted Estimator

#### Theory
EWE models each annotator's trace as the underlying ground truth $S_t$ corrupted by annotator-specific noise:

$$y_{i,t} = S_t + \epsilon_{i,t}, \quad \epsilon_{i,t} \sim \mathcal{N}(0, \sigma_i^2)$$

By weighting each annotator inversely proportional to their empirical variance $\sigma_i^2$, EWE minimizes the total mean-squared error (MSE) of the aggregated estimator — trusting stable annotators more.

#### Formula

**Step 1 — Initial unweighted consensus (bootstrap):**
$$\hat{S}_t^{(0)} = \frac{1}{M} \sum_{i=1}^{M} y_{i,t}$$

**Step 2 — Empirical annotator variance:**
$$\sigma_i^2 = \frac{1}{T} \sum_{t=1}^{T} \left(y_{i,t} - \hat{S}_t^{(0)}\right)^2 + \varepsilon$$

where $\varepsilon = 10^{-6}$ prevents division by zero for perfectly stable annotators.

**Step 3 — Inverse-variance weights:**
$$w_i^{\text{EWE}} = \frac{1/\sigma_i^2}{\sum_{j=1}^{M} 1/\sigma_j^2}$$

**Step 4 — Denoised consensus output:**
$$\hat{y}_t^{\text{EWE}} = \sum_{i=1}^{M} w_i^{\text{EWE}} \cdot y_{i,t}$$

---

## Part 2 — Implementation Plan for `/researcher-voting`

### 2.1 Context & Current State

- **Page**: `src/app/researcher-voting/page.tsx` — currently uploads CSV files and shows per-file dimension stats using a mock `consensusScore: 0.84`. No real aggregation logic exists yet.
- **State**: Local React `useState` only (no global store needed — the voting page is self-contained).
- **Data shape**: Each uploaded CSV = one annotator trace. Columns are detected dimensions (e.g., `Emotion`). Each row = one frame/timestep.
- **Framework**: Next.js 15 App Router, TypeScript, CSS Modules (no Tailwind). Design token variables are defined globally (e.g., `var(--accent)`, `var(--bg-card)`).

### 2.2 File Structure to Create / Modify

```
src/
├── app/
│   └── researcher-voting/
│       ├── page.tsx                  <- MODIFY (main integration point)
│       └── page.module.css           <- MODIFY (add voting selector + results styles)
└── lib/
    └── voting/
        ├── types.ts                  <- NEW (shared types for voting)
        ├── soft-voting.ts            <- NEW (Algorithm 1)
        ├── weighted-voting.ts        <- NEW (Algorithm 2)
        └── ewe-voting.ts             <- NEW (Algorithm 3)
        └── index.ts                  <- NEW (orchestrator/barrel)
```

---

### 2.3 Step 1 — Create Shared Types (`src/lib/voting/types.ts`)

```typescript
// src/lib/voting/types.ts

export type VotingMethod = 'SOFT_VOTING' | 'WEIGHTED_VOTING' | 'EWE';

/** One annotator's parsed trace for a single dimension. */
export interface AgentTrace {
  agentId: string;       // filename or annotator ID
  values: number[];      // length T — one value per frame/row
}

/** Computed per-agent metadata after aggregation. */
export interface AgentMeta {
  agentId: string;
  weight: number;                   // final normalized weight applied
  alphaReliability?: number;        // only for WEIGHTED_VOTING
  empiricalVariance?: number;       // only for EWE
}

/** Full result returned by any voting algorithm. */
export interface VotingResult {
  method: VotingMethod;
  dimension: string;                // which dimension was aggregated
  consensusTrace: number[];         // length T — the final aggregated sequence
  agentMeta: AgentMeta[];
  frameCount: number;
  agentCount: number;
}
```

---

### 2.4 Step 2 — Implement Algorithm 1: Soft Voting (`src/lib/voting/soft-voting.ts`)

```typescript
// src/lib/voting/soft-voting.ts
import { AgentTrace, VotingResult } from './types';

/**
 * Soft Voting: unweighted arithmetic mean across all agent traces per frame.
 * Formula: y_hat_t = (1/M) * sum(y_{i,t})
 *
 * Time complexity: O(M * T)
 * Assumption: Agents have equal skill; errors are i.i.d. zero-mean.
 */
export function softVoting(traces: AgentTrace[], dimension: string): VotingResult {
  const M = traces.length;
  const T = traces[0].values.length;
  const uniformWeight = 1 / M;

  const consensusTrace = Array.from({ length: T }, (_, t) => {
    const sum = traces.reduce((acc, trace) => acc + (trace.values[t] ?? 0), 0);
    return sum / M;
  });

  return {
    method: 'SOFT_VOTING',
    dimension,
    consensusTrace,
    frameCount: T,
    agentCount: M,
    agentMeta: traces.map(trace => ({
      agentId: trace.agentId,
      weight: uniformWeight,
    })),
  };
}
```

---

### 2.5 Step 3 — Implement Algorithm 2: Weighted Voting (`src/lib/voting/weighted-voting.ts`)

```typescript
// src/lib/voting/weighted-voting.ts
import { AgentTrace, VotingResult } from './types';

/**
 * Weighted Voting: LOO Krippendorff alpha-based reliability weighting.
 *
 * For each agent i:
 *   1. Compute cohort mean excluding agent i: y_bar_{-i,t}
 *   2. Compute observed disagreement D_o and expected disagreement D_e
 *   3. alpha_i = 1 - (D_o / D_e)
 *   4. w_i = max(0, alpha_i) / sum(max(0, alpha_j))
 *
 * Edge case: If all alpha_i <= 0 => fall back to uniform weights (Soft Voting).
 * Time complexity: O(M^2 * T)
 */
export function weightedVoting(traces: AgentTrace[], dimension: string): VotingResult {
  const M = traces.length;
  const T = traces[0].values.length;

  // Step 1: Compute LOO cohort means for each agent i
  const looMeans: number[][] = traces.map((_, i) => {
    return Array.from({ length: T }, (_, t) => {
      let sum = 0;
      let count = 0;
      for (let j = 0; j < M; j++) {
        if (j !== i) { sum += traces[j].values[t]; count++; }
      }
      return count > 0 ? sum / count : 0;
    });
  });

  // Step 2: Compute alpha_i for each agent
  const alphas = traces.map((trace, i) => {
    const looMean = looMeans[i];

    // Observed disagreement D_o: mean squared difference between agent and LOO mean
    const D_o = trace.values.reduce((acc, v, t) => acc + (v - looMean[t]) ** 2, 0) / T;

    // Expected disagreement D_e: from interval distance metric
    let D_e = 0;
    for (let t = 0; t < T; t++) {
      for (let k = 0; k < T; k++) {
        D_e += (trace.values[t] - trace.values[k]) ** 2;
        D_e += (looMean[t] - looMean[k]) ** 2;
      }
    }
    D_e /= 2 * T * T;

    return D_e === 0 ? 0 : 1 - D_o / D_e;
  });

  // Step 3: Normalize weights, clamp negatives to 0
  const clampedAlphas = alphas.map(a => Math.max(0, a));
  const alphaSum = clampedAlphas.reduce((a, b) => a + b, 0);

  // Step 4: Fallback to uniform if all alphas <= 0
  const weights = alphaSum > 0
    ? clampedAlphas.map(a => a / alphaSum)
    : traces.map(() => 1 / M);

  // Step 5: Compute weighted consensus trace
  const consensusTrace = Array.from({ length: T }, (_, t) =>
    traces.reduce((acc, trace, i) => acc + weights[i] * trace.values[t], 0)
  );

  return {
    method: 'WEIGHTED_VOTING',
    dimension,
    consensusTrace,
    frameCount: T,
    agentCount: M,
    agentMeta: traces.map((trace, i) => ({
      agentId: trace.agentId,
      weight: weights[i],
      alphaReliability: alphas[i],
    })),
  };
}
```

---

### 2.6 Step 4 — Implement Algorithm 3: EWE (`src/lib/voting/ewe-voting.ts`)

```typescript
// src/lib/voting/ewe-voting.ts
import { AgentTrace, VotingResult } from './types';

const EPSILON = 1e-6;

/**
 * EWE (Evaluator Weighted Estimator): inverse-variance weighting.
 *
 * Steps:
 *   1. Compute initial unweighted consensus S^(0) (Soft Voting)
 *   2. Estimate each agent's empirical variance sigma_i^2 against S^(0)
 *   3. w_i = (1/sigma_i^2) / sum(1/sigma_j^2)
 *   4. Final consensus: sum(w_i * y_{i,t})
 *
 * Time complexity: O(M * T)
 */
export function eweVoting(traces: AgentTrace[], dimension: string): VotingResult {
  const M = traces.length;
  const T = traces[0].values.length;

  // Step 1: Initial unweighted consensus (bootstrap)
  const initialConsensus = Array.from({ length: T }, (_, t) =>
    traces.reduce((sum, trace) => sum + trace.values[t], 0) / M
  );

  // Step 2: Empirical variance per agent
  const variances = traces.map(trace =>
    trace.values.reduce((acc, v, t) => acc + (v - initialConsensus[t]) ** 2, 0) / T + EPSILON
  );

  // Step 3: Inverse-variance weights
  const invVariances = variances.map(v => 1 / v);
  const invVarSum = invVariances.reduce((a, b) => a + b, 0);
  const weights = invVariances.map(iv => iv / invVarSum);

  // Step 4: Denoised consensus output
  const consensusTrace = Array.from({ length: T }, (_, t) =>
    traces.reduce((acc, trace, i) => acc + weights[i] * trace.values[t], 0)
  );

  return {
    method: 'EWE',
    dimension,
    consensusTrace,
    frameCount: T,
    agentCount: M,
    agentMeta: traces.map((trace, i) => ({
      agentId: trace.agentId,
      weight: weights[i],
      empiricalVariance: variances[i] - EPSILON, // subtract epsilon for clean display
    })),
  };
}
```

---

### 2.7 Step 5 — Orchestrator Barrel (`src/lib/voting/index.ts`)

```typescript
// src/lib/voting/index.ts
export * from './types';
export { softVoting } from './soft-voting';
export { weightedVoting } from './weighted-voting';
export { eweVoting } from './ewe-voting';

import { softVoting } from './soft-voting';
import { weightedVoting } from './weighted-voting';
import { eweVoting } from './ewe-voting';
import { AgentTrace, VotingMethod, VotingResult } from './types';

/**
 * Main dispatch function — runs the selected voting algorithm.
 *
 * @param method - 'SOFT_VOTING' | 'WEIGHTED_VOTING' | 'EWE'
 * @param traces - Array of agent traces (one per uploaded CSV file)
 * @param dimension - The dimension column name being aggregated
 * @returns VotingResult with consensusTrace and per-agent metadata
 */
export function runVoting(
  method: VotingMethod,
  traces: AgentTrace[],
  dimension: string
): VotingResult {
  switch (method) {
    case 'SOFT_VOTING':     return softVoting(traces, dimension);
    case 'WEIGHTED_VOTING': return weightedVoting(traces, dimension);
    case 'EWE':             return eweVoting(traces, dimension);
  }
}
```

---

### 2.8 Step 6 — Modify `page.tsx` — State, Imports & Logic

#### 6a. New imports (add at top of file)
```typescript
import { runVoting, VotingMethod, VotingResult, AgentTrace } from '@/lib/voting';
```

#### 6b. New state variables (inside `ResearcherVotingPage`)
```typescript
const [votingMethod, setVotingMethod] = useState<VotingMethod>('SOFT_VOTING'); // DEFAULT
const [selectedDimension, setSelectedDimension] = useState<string>('');
const [votingResult, setVotingResult] = useState<VotingResult | null>(null);
```

#### 6c. Replace `runAnalysis()` with real computation
```typescript
const runAnalysis = () => {
  if (uploadedFiles.length < 2) return;
  setIsAnalyzing(true);

  // setTimeout(0) yields to React so spinner renders before blocking computation
  setTimeout(() => {
    try {
      // 1. Find shared dimensions across all files
      const allDims = uploadedFiles[0].dimensions;
      const sharedDims = allDims.filter(dim =>
        uploadedFiles.every(f => f.dimensions.includes(dim))
      );
      if (sharedDims.length === 0) throw new Error('No shared dimensions across files.');

      // 2. Resolve active dimension (default to first shared dim)
      const activeDim = selectedDimension && sharedDims.includes(selectedDimension)
        ? selectedDimension
        : sharedDims[0];
      if (!selectedDimension) setSelectedDimension(sharedDims[0]);

      // 3. Build AgentTrace[] for the active dimension
      const traces: AgentTrace[] = uploadedFiles.map(file => ({
        agentId: file.name,
        values: file.data.map((row: any) => {
          const v = parseFloat(row[activeDim]);
          return isNaN(v) ? 0 : v;
        }),
      }));

      // 4. Align trace lengths to shortest (safeguard for mismatched CSVs)
      const minLen = Math.min(...traces.map(t => t.values.length));
      const alignedTraces = traces.map(t => ({ ...t, values: t.values.slice(0, minLen) }));

      // 5. Run voting
      const result = runVoting(votingMethod, alignedTraces, activeDim);

      // 6. Build per-file stats for the summary table (existing UX unchanged)
      const fileSummaries = uploadedFiles.map(file => {
        const dimensionsStats = file.dimensions.reduce((acc: any, dim: string) => {
          const values = file.data.map((row: any) => parseFloat(row[dim])).filter((v: number) => !isNaN(v));
          acc[dim] = {
            avg: values.length > 0 ? Math.round(values.reduce((s: number, v: number) => s + v, 0) / values.length * 100) / 100 : 0,
            min: values.length > 0 ? Math.min(...values) : 0,
            max: values.length > 0 ? Math.max(...values) : 0,
          };
          return acc;
        }, {});
        return { name: file.name, rowCount: file.rowCount, dimensionsStats };
      });

      setAnalysisResult({ fileCount: uploadedFiles.length, fileSummaries, sharedDims });
      setVotingResult(result);
    } catch (err: any) {
      console.error('[runAnalysis] Error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  }, 0);
};
```

---

### 2.9 Step 7 — UI: Voting Method Selector (TSX block)

Place this block **inside `<div className={styles.actionBlock}>`**, above the analyze button:

```tsx
{/* Voting Method Selector */}
{uploadedFiles.length >= 2 && (
  <div className={styles.votingSelector}>
    <span className={styles.votingSelectorLabel}>Consensus Method</span>
    <div className={styles.votingOptions}>
      {([
        { value: 'SOFT_VOTING',     label: 'Soft Voting',    desc: 'Arithmetic mean — fast baseline' },
        { value: 'WEIGHTED_VOTING', label: 'Weighted Voting', desc: 'α-Reliability weighted (LOO Krippendorff)' },
        { value: 'EWE',             label: 'EWE',             desc: 'Inverse-variance denoising' },
      ] as { value: VotingMethod; label: string; desc: string }[]).map(opt => (
        <button
          key={opt.value}
          className={`${styles.votingOption} ${votingMethod === opt.value ? styles.votingOptionActive : ''}`}
          onClick={() => { setVotingMethod(opt.value); setVotingResult(null); }}
        >
          <span className={styles.votingOptionLabel}>{opt.label}</span>
          <span className={styles.votingOptionDesc}>{opt.desc}</span>
          {opt.value === 'SOFT_VOTING' && (
            <span className={styles.defaultBadge}>Default</span>
          )}
        </button>
      ))}
    </div>
  </div>
)}
```

---

### 2.10 Step 8 — UI: Voting Results Panel (TSX block)

Place this block **inside `.resultContent`**, after the existing summary table:

```tsx
{/* Voting Results Panel */}
{votingResult && (
  <div className={styles.votingResultsPanel}>
    <div className={styles.votingResultsHeader}>
      <span className={styles.votingMethodBadge}>
        {votingResult.method.replace(/_/g, ' ')}
      </span>
      <span className={styles.votingDimLabel}>
        Dimension: <strong>{votingResult.dimension}</strong>
      </span>
    </div>

    {/* Consensus Trace Summary Stats */}
    <div className={styles.traceStatsRow}>
      {[
        { label: 'Min',    value: Math.min(...votingResult.consensusTrace).toFixed(4) },
        { label: 'Mean',   value: (votingResult.consensusTrace.reduce((a,b)=>a+b,0)/votingResult.consensusTrace.length).toFixed(4) },
        { label: 'Max',    value: Math.max(...votingResult.consensusTrace).toFixed(4) },
        { label: 'Frames', value: String(votingResult.frameCount) },
      ].map(stat => (
        <div key={stat.label} className={styles.traceStat}>
          <span className={styles.traceStatLabel}>{stat.label}</span>
          <span className={styles.traceStatVal}>{stat.value}</span>
        </div>
      ))}
    </div>

    {/* Per-Agent Weight Breakdown */}
    <div className={styles.agentWeightsTable}>
      <table className={styles.summaryTable}>
        <thead>
          <tr>
            <th>Annotator File</th>
            <th>Weight</th>
            {votingResult.method === 'WEIGHTED_VOTING' && <th>α Reliability</th>}
            {votingResult.method === 'EWE' && <th>Variance σ²</th>}
          </tr>
        </thead>
        <tbody>
          {votingResult.agentMeta.map(agent => (
            <tr key={agent.agentId}>
              <td className={styles.fileNameCell}>{agent.agentId}</td>
              <td>
                <div className={styles.weightBarRow}>
                  <div
                    className={styles.weightBar}
                    style={{ width: `${Math.max(4, agent.weight * 100).toFixed(1)}%` }}
                  />
                  <span>{(agent.weight * 100).toFixed(1)}%</span>
                </div>
              </td>
              {votingResult.method === 'WEIGHTED_VOTING' && (
                <td>{agent.alphaReliability?.toFixed(4) ?? '—'}</td>
              )}
              {votingResult.method === 'EWE' && (
                <td>{agent.empiricalVariance?.toFixed(6) ?? '—'}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)}
```

---

### 2.11 Step 9 — CSS Additions (append to `page.module.css`)

```css
/* === Voting Method Selector === */
.votingSelector {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--gap-sm);
  padding-bottom: var(--gap-md);
}

.votingSelectorLabel {
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.votingOptions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--gap-sm);
}

@media (max-width: 640px) {
  .votingOptions { grid-template-columns: 1fr; }
}

.votingOption {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--gap-sm) var(--gap-md);
  background: var(--bg-card);
  border: 1px solid var(--bg-card-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition: all var(--transition-fast);
}

.votingOption:hover {
  border-color: var(--accent);
  background: rgba(108, 92, 231, 0.04);
}

.votingOptionActive {
  border-color: var(--accent);
  background: rgba(108, 92, 231, 0.08);
  box-shadow: 0 0 0 1px var(--accent);
}

.votingOptionLabel {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.votingOptionDesc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}

.defaultBadge {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  background: rgba(0, 210, 160, 0.12);
  border: 1px solid rgba(0, 210, 160, 0.25);
  border-radius: var(--radius-xl);
  color: var(--success);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

/* === Voting Results Panel === */
.votingResultsPanel {
  margin-top: var(--gap-md);
  border: 1px solid rgba(108, 92, 231, 0.15);
  border-radius: var(--radius-md);
  overflow: hidden;
  animation: slideUp 300ms ease both;
}

.votingResultsHeader {
  display: flex;
  align-items: center;
  gap: var(--gap-md);
  padding: var(--gap-sm) var(--gap-md);
  background: rgba(108, 92, 231, 0.06);
  border-bottom: 1px solid var(--bg-card-border);
}

.votingMethodBadge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 10px;
  background: rgba(108, 92, 231, 0.15);
  border: 1px solid rgba(108, 92, 231, 0.3);
  border-radius: var(--radius-xl);
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.votingDimLabel {
  font-size: 13px;
  color: var(--text-secondary);
}

.traceStatsRow {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: var(--bg-card-border);
  border-bottom: 1px solid var(--bg-card-border);
}

@media (max-width: 640px) {
  .traceStatsRow { grid-template-columns: repeat(2, 1fr); }
}

.traceStat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--gap-sm) var(--gap-md);
  background: var(--bg-card);
}

.traceStatLabel {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.traceStatVal {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.agentWeightsTable {
  padding: var(--gap-sm);
}

.weightBarRow {
  display: flex;
  align-items: center;
  gap: var(--gap-sm);
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--text-primary);
}

.weightBar {
  height: 6px;
  min-width: 4px;
  max-width: 120px;
  background: linear-gradient(90deg, var(--accent), #a29bfe);
  border-radius: 3px;
  transition: width var(--transition-normal);
}
```

---

### 2.12 Step 10 — Dimension Selector (optional, for multi-dimension files)

When files have more than one shared dimension, show a pill-picker before the voting selector. Add this TSX inside `.actionBlock` above the voting method selector:

```tsx
{/* Dimension Selector — only when >1 shared dims exist after first analysis */}
{analysisResult?.sharedDims?.length > 1 && (
  <div className={styles.votingSelector}>
    <span className={styles.votingSelectorLabel}>Aggregate Dimension</span>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--gap-xs)' }}>
      {(analysisResult.sharedDims as string[]).map((dim) => (
        <button
          key={dim}
          className={`${styles.dimBadge} ${selectedDimension === dim ? styles.dimBadgeActive : ''}`}
          style={{
            cursor: 'pointer',
            border: selectedDimension === dim ? '1px solid var(--accent)' : undefined,
            color: selectedDimension === dim ? 'var(--accent)' : undefined,
            background: selectedDimension === dim ? 'rgba(108,92,231,0.1)' : undefined,
          }}
          onClick={() => { setSelectedDimension(dim); setVotingResult(null); }}
        >
          {dim}
        </button>
      ))}
    </div>
  </div>
)}
```

---

### 2.13 Execution Order

Implement in this exact order to avoid broken imports:

```
1. src/lib/voting/types.ts            (types first — no dependencies)
2. src/lib/voting/soft-voting.ts      (imports types only)
3. src/lib/voting/weighted-voting.ts  (imports types only)
4. src/lib/voting/ewe-voting.ts       (imports types only)
5. src/lib/voting/index.ts            (imports all above — barrel)
6. src/app/researcher-voting/page.module.css   (append new CSS classes)
7. src/app/researcher-voting/page.tsx          (integrate state + UI)
```

---

### 2.14 Validation & Edge Cases

| Scenario | Handling |
|:---|:---|
| Files have different row counts | Align all traces to `Math.min(T_1, T_2, ...)` before voting |
| No shared dimensions across files | Error thrown in `runAnalysis()`, analysis blocked |
| All `alpha_i <= 0` in Weighted Voting | Fallback to uniform weights (equivalent to Soft Voting) |
| Annotator has constant trace (zero variance) | `sigma_i^2 = EPSILON` prevents division-by-zero in EWE |
| Only 1 file uploaded | Analysis button stays disabled — existing guard `uploadedFiles.length < 2` |
| Non-numeric values in dimension column | `parseFloat(row[dim])` returns `NaN` -> replaced with `0` in trace builder |
| `M = 2` and Weighted Voting | D_e may be very small; alpha_i clamped properly, fallback handles it |

---

### 2.15 Key Design Decisions

| Decision | Rationale |
|:---|:---|
| Default method = `SOFT_VOTING` | Cheapest, most interpretable, no prerequisites |
| No global store (`store.ts`) changes | Voting page is fully self-contained; avoids store pollution |
| Pure functions only | No side effects, deterministic output, easily unit-testable |
| Single dispatch via `runVoting()` | `page.tsx` only calls one function regardless of selected method |
| No external stats libraries | All math is vanilla TypeScript — no extra bundle size |
| CSS token reuse | All new styles use existing `var(--*)` tokens for consistency |
| `setTimeout(0)` before computation | Ensures React flushes spinner state before blocking CPU work |