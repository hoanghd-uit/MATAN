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
  if (M === 0) {
    return {
      method: 'SOFT_VOTING',
      dimension,
      consensusTrace: [],
      frameCount: 0,
      agentCount: 0,
      agentMeta: [],
    };
  }

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
