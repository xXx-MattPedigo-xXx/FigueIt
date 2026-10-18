import { useEffect, useState } from 'react';
import { PATTERNS, computeLayout, isApplicable } from './engine';
import type { Paver, PatternId, Pt } from './engine';

export interface CompareInputs {
  shape: Pt[];
  paver: Paver;
  rotation: number;
  offset: Pt;
}

export interface PatternCounts {
  pattern: PatternId;
  full: number;
  cut: number;
  total: number;
}

export interface CompareResult {
  inputs: CompareInputs;
  counts: PatternCounts[];
}

/**
 * Counts pavers for every applicable pattern, off the typing path. Laying out a big patio costs around
 * 100 ms per pattern, so this waits for typing to pause and then does one pattern per timer tick, which
 * keeps the page responsive. A new keystroke cancels the work in progress.
 * Placements are discarded as soon as they are counted: the table only needs the numbers.
 * Returns the last finished result (which may be for older inputs; compare `result.inputs` with `inputs`).
 */
export function useCompareCounts(inputs: CompareInputs | null): CompareResult | null {
  const [result, setResult] = useState<CompareResult | null>(null);

  useEffect(() => {
    if (!inputs) return;
    let cancelled = false;
    const { shape, paver, rotation, offset } = inputs;
    const patterns = PATTERNS.filter((p) => isApplicable(p.id, paver));
    const counts: PatternCounts[] = [];

    const step = () => {
      if (cancelled) return;
      const p = patterns[counts.length];
      const { full, cut, total } = computeLayout(shape, paver, p.id, rotation, offset);
      counts.push({ pattern: p.id, full, cut, total });
      if (counts.length === patterns.length) setResult({ inputs, counts });
      else timer = setTimeout(step, 0);
    };

    let timer = setTimeout(step, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [inputs]);

  return result;
}
