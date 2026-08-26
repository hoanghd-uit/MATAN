export type ScaleType = 'NOMINAL' | 'ORDINAL' | 'INTERVAL' | 'RATIO';

export interface KrippendorffInput {
  // raterMatrix[r][u] is the rating by rater r for unit u.
  // Can be number or null (representing missing data).
  raterMatrix: (number | null)[][];
  scale: ScaleType;
}

export interface KrippendorffResult {
  alpha: number;
  Do: number;
  De: number;
  unitCount: number;      // Number of units (rows) with at least 2 ratings
  raterCount: number;     // Number of raters (files)
  pairedCount: number;    // n - total pairable values in valid units
  scale: ScaleType;
  interpretation: string;
}

/**
 * Returns a user-friendly interpretation of the Alpha score based on standard benchmarks.
 */
export function getAlphaInterpretation(alpha: number): string {
  if (alpha === 1.0) {
    return 'Perfect Agreement';
  } else if (alpha >= 0.80) {
    return 'High Reliability';
  } else if (alpha >= 0.67) {
    return 'Tentative Reliability';
  } else if (alpha > 0.0) {
    return 'Low Reliability / High Noise';
  } else {
    return 'Chance or Opposite Agreement';
  }
}

/**
 * Calculates Krippendorff's Alpha for a given rater matrix and scale.
 * 
 * @param input - Contains the rater matrix and the scale type.
 * @returns The calculated KrippendorffResult.
 */
export function calculateKrippendorff(input: KrippendorffInput): KrippendorffResult {
  const { raterMatrix, scale } = input;
  
  const raterCount = raterMatrix.length;
  if (raterCount < 2) {
    return {
      alpha: 0,
      Do: 0,
      De: 0,
      unitCount: 0,
      raterCount,
      pairedCount: 0,
      scale,
      interpretation: 'Insufficient raters',
    };
  }

  const rawUnitCount = raterMatrix[0].length;
  
  // 1. Filter units that have at least 2 non-null ratings
  const validUnits: { uIdx: number; ratings: number[] }[] = [];
  
  for (let u = 0; u < rawUnitCount; u++) {
    const ratings: number[] = [];
    for (let r = 0; r < raterCount; r++) {
      const val = raterMatrix[r][u];
      if (val !== null && !isNaN(val)) {
        ratings.push(val);
      }
    }
    if (ratings.length >= 2) {
      validUnits.push({ uIdx: u, ratings });
    }
  }

  const unitCount = validUnits.length;
  if (unitCount === 0) {
    return {
      alpha: 0,
      Do: 0,
      De: 0,
      unitCount: 0,
      raterCount,
      pairedCount: 0,
      scale,
      interpretation: 'No units with >= 2 ratings',
    };
  }

  // 2. Identify the set of unique values V across valid units
  const uniqueValuesSet = new Set<number>();
  for (const unit of validUnits) {
    for (const val of unit.ratings) {
      uniqueValuesSet.add(val);
    }
  }
  const uniqueValues = Array.from(uniqueValuesSet).sort((a, b) => a - b);
  const V = uniqueValues;

  // 3. Compute frequencies n_uv and n_v
  // n_uv[u][v] is frequency of value v in unit u
  // n_v[v] is frequency of value v overall
  const n_uv: Record<number, Record<number, number>> = {};
  const n_v: Record<number, number> = {};
  
  // Initialize n_v
  for (const v of V) {
    n_v[v] = 0;
  }

  for (let i = 0; i < validUnits.length; i++) {
    const unit = validUnits[i];
    n_uv[i] = {};
    for (const v of V) {
      n_uv[i][v] = 0;
    }
    for (const val of unit.ratings) {
      n_uv[i][val] = (n_uv[i][val] || 0) + 1;
      n_v[val] = (n_v[val] || 0) + 1;
    }
  }

  // Total pairable values: sum of ratings count in valid units
  const n = validUnits.reduce((acc, unit) => acc + unit.ratings.length, 0);

  // 4. Define Distance Function δ²(v, v')
  // For Ordinal distance: delta2(v, v') = ( sum_{g=v}^{v'} n_g - (n_v + n_v')/2 )^2
  // We can precompute or compute dynamically. Since Ordinal requires summation over
  // values ordered between v and v', we use the sorted unique values V.
  const getDistanceSq = (v: number, vPrime: number): number => {
    if (v === vPrime) return 0;

    switch (scale) {
      case 'NOMINAL':
        return 1;

      case 'ORDINAL': {
        const idxA = V.indexOf(v);
        const idxB = V.indexOf(vPrime);
        const startIdx = Math.min(idxA, idxB);
        const endIdx = Math.max(idxA, idxB);
        
        let sum_g = 0;
        for (let g = startIdx; g <= endIdx; g++) {
          sum_g += n_v[V[g]];
        }
        
        const offset = (n_v[v] + n_v[vPrime]) / 2;
        const diff = sum_g - offset;
        return diff * diff;
      }

      case 'INTERVAL': {
        const diff = v - vPrime;
        return diff * diff;
      }

      case 'RATIO': {
        if (v + vPrime === 0) return 0;
        const ratio = (v - vPrime) / (v + vPrime);
        return ratio * ratio;
      }

      default:
        return 0;
    }
  };

  // 5. Compute Observed Disagreement (Do)
  // Do = [1 / \sum m_u(m_u-1)] * \sum_u \sum_v \sum_v' n_uv * n_uv' * δ²(v, v')
  let doNumerator = 0;
  let doDenominator = 0;

  for (let i = 0; i < validUnits.length; i++) {
    const m_u = validUnits[i].ratings.length;
    doDenominator += m_u * (m_u - 1);

    // Sum over all pairs (v, v') in V
    for (let j = 0; j < V.length; j++) {
      const v = V[j];
      const count_v = n_uv[i][v] || 0;
      if (count_v === 0) continue;

      for (let k = 0; k < V.length; k++) {
        const vPrime = V[k];
        const count_vPrime = n_uv[i][vPrime] || 0;
        if (count_vPrime === 0) continue;

        const distSq = getDistanceSq(v, vPrime);
        doNumerator += count_v * count_vPrime * distSq;
      }
    }
  }

  const Do = doDenominator > 0 ? doNumerator / doDenominator : 0;

  // 6. Compute Expected Disagreement (De)
  // De = [1 / n(n - 1)] * \sum_v \sum_v' n_v * n_v' * δ²(v, v')
  let deNumerator = 0;
  for (let j = 0; j < V.length; j++) {
    const v = V[j];
    const freq_v = n_v[v];
    if (freq_v === 0) continue;

    for (let k = 0; k < V.length; k++) {
      const vPrime = V[k];
      const freq_vPrime = n_v[vPrime];
      if (freq_vPrime === 0) continue;

      const distSq = getDistanceSq(v, vPrime);
      deNumerator += freq_v * freq_vPrime * distSq;
    }
  }

  const deDenominator = n * (n - 1);
  const De = deDenominator > 0 ? deNumerator / deDenominator : 0;

  // 7. Calculate Alpha
  // If De is 0, we check if Do is also 0. If both are 0, agreement is perfect (alpha = 1).
  // Otherwise, if De is 0 but Do is not, alpha is undefined or 0.
  let alpha = 1;
  if (De > 0) {
    alpha = 1 - (Do / De);
  } else if (Do > 0) {
    alpha = 0;
  }

  return {
    alpha,
    Do,
    De,
    unitCount,
    raterCount,
    pairedCount: n,
    scale,
    interpretation: getAlphaInterpretation(alpha),
  };
}
