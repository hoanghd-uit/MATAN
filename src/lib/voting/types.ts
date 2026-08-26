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
