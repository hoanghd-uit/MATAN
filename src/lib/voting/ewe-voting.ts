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
  if (M === 0) {
    return {
      method: 'EWE',
      dimension,
      consensusTrace: [],
      frameCount: 0,
      agentCount: 0,
      agentMeta: [],
    };
  }

  const T = traces[0].values.length;

  if (M === 1) {
    return {
      method: 'EWE',
      dimension,
      consensusTrace: [...traces[0].values],
      frameCount: T,
      agentCount: 1,
      agentMeta: [{ agentId: traces[0].agentId, weight: 1, empiricalVariance: 0 }],
    };
  }

  // Step 1: Initial unweighted consensus (bootstrap)
  const initialConsensus = Array.from({ length: T }, (_, t) =>
    traces.reduce((sum, trace) => sum + trace.values[t], 0) / M
  );

  // Step 2: Empirical variance per agent (plus epsilon to avoid division by zero)
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
