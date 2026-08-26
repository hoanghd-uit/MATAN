import { AgentTrace, VotingResult } from './types';

/**
 * Calculates the population variance of a number array.
 * Used for O(T) expected disagreement calculation.
 */
function getVariance(arr: number[]): number {
  const T = arr.length;
  if (T === 0) return 0;
  const mean = arr.reduce((sum, v) => sum + v, 0) / T;
  const sqDiffSum = arr.reduce((sum, v) => sum + (v - mean) ** 2, 0);
  return sqDiffSum / T;
}

/**
 * Weighted Voting: LOO Krippendorff alpha-based reliability weighting.
 *
 * For each agent i:
 *   1. Compute cohort mean excluding agent i: y_bar_{-i,t}
 *   2. Compute observed disagreement D_o and expected disagreement D_e
 *      Mathematically optimized D_e = Var(y_i) + Var(y_bar_{-i}) from O(T^2) to O(T)
 *   3. alpha_i = 1 - (D_o / D_e)
 *   4. w_i = max(0, alpha_i) / sum(max(0, alpha_j))
 *
 * Edge case: If all alpha_i <= 0 => fall back to uniform weights (Soft Voting).
 * Time complexity: O(M^2 * T) (previously O(M * T^2))
 */
export function weightedVoting(
  traces: AgentTrace[],
  dimension: string,
  manualWeights?: Record<string, number>
): VotingResult {
  const M = traces.length;
  if (M === 0) {
    return {
      method: 'WEIGHTED_VOTING',
      dimension,
      consensusTrace: [],
      frameCount: 0,
      agentCount: 0,
      agentMeta: [],
    };
  }

  const T = traces[0].values.length;

  // If there's only 1 agent, weighted voting is just that agent's trace with weight 1
  if (M === 1) {
    return {
      method: 'WEIGHTED_VOTING',
      dimension,
      consensusTrace: [...traces[0].values],
      frameCount: T,
      agentCount: 1,
      agentMeta: [{ agentId: traces[0].agentId, weight: 1, alphaReliability: 1 }],
    };
  }

  // Step 1: Compute LOO cohort means for each agent i
  const looMeans: number[][] = traces.map((_, i) => {
    return Array.from({ length: T }, (_, t) => {
      let sum = 0;
      let count = 0;
      for (let j = 0; j < M; j++) {
        if (j !== i) {
          sum += traces[j].values[t];
          count++;
        }
      }
      return count > 0 ? sum / count : 0;
    });
  });

  // Step 2: Compute alpha_i for each agent using O(T) variance sums
  const alphas = traces.map((trace, i) => {
    const looMean = looMeans[i];

    // Observed disagreement D_o: mean squared difference between agent and LOO mean
    const D_o = trace.values.reduce((acc, v, t) => acc + (v - looMean[t]) ** 2, 0) / T;

    // Expected disagreement D_e: sum of population variances of both series
    const D_e = getVariance(trace.values) + getVariance(looMean);

    // If D_e is zero, they are flat lines. 
    // If D_o is also zero, they match exactly (alpha = 1), otherwise mismatch (alpha = 0).
    return D_e === 0 ? (D_o === 0 ? 1 : 0) : 1 - D_o / D_e;
  });

  // Step 3: Determine weights (use manual weights if provided, otherwise compute from alphas)
  let weights: number[];
  if (manualWeights) {
    weights = traces.map((trace) => manualWeights[trace.agentId] ?? (1 / M));
  } else {
    // Normalize weights, clamp negatives to 0
    const clampedAlphas = alphas.map(a => Math.max(0, a));
    const alphaSum = clampedAlphas.reduce((a, b) => a + b, 0);

    // Fallback to uniform if all alphas <= 0
    weights = alphaSum > 0
      ? clampedAlphas.map(a => a / alphaSum)
      : traces.map(() => 1 / M);
  }

  // Step 4: Compute weighted consensus trace
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
