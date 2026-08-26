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
  dimension: string,
  manualWeights?: Record<string, number>
): VotingResult {
  switch (method) {
    case 'SOFT_VOTING':     return softVoting(traces, dimension);
    case 'WEIGHTED_VOTING': return weightedVoting(traces, dimension, manualWeights);
    case 'EWE':             return eweVoting(traces, dimension);
  }
}
