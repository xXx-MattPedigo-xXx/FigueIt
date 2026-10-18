import { PATTERNS, formatLength, formatSqFt } from '../engine';
import type { PatternId, Summary } from '../engine';
import { formatCount, formatSqM } from './format';

/** One row of the compare table: counts only, the placements are thrown away. */
export interface CompareRow {
  pattern: PatternId;
  full: number;
  cut: number;
  total: number;
  order: number;
}

interface ResultsProps {
  /** null when there is nothing to report yet (for example a custom polygon with fewer than 3 points). */
  summary: Summary | null;
  areaSqIn: number;
  stale: boolean;
  /** Set when the selected pattern cannot be laid with this paver. */
  inapplicableNote: string | null;
  emptyNote: string;
}

export function Results({ summary, areaSqIn, stale, inapplicableNote, emptyNote }: ResultsProps) {
  return (
    <section className={`card results${stale ? ' stale' : ''}`} aria-live="polite">
      <h2>Results</h2>
      {stale && <p className="badge">Out of date - fix the highlighted fields</p>}
      {!summary ? (
        <p className="muted">{emptyNote}</p>
      ) : (
        <>
          {inapplicableNote && <p className="warning">{inapplicableNote}</p>}
          <dl className="stats">
            <Stat label="Area" value={`${formatSqFt(areaSqIn)} sq ft`} sub={`${formatSqM(areaSqIn)} sq m`} />
            <Stat label="Perimeter" value={formatLength(summary.perimeterIn)} />
            <Stat label="Full pavers" value={formatCount(summary.full)} />
            <Stat label="Cut pavers" value={formatCount(summary.cut)} />
            <Stat label="Total to lay" value={formatCount(summary.total)} />
            <Stat label="Order quantity" value={formatCount(summary.order)} sub="includes waste" big />
            <Stat label="Theoretical minimum" value={formatCount(summary.minimum)} sub="no cuts, no waste" />
          </dl>
        </>
      )}
    </section>
  );
}

function Stat({ label, value, sub, big }: { label: string; value: string; sub?: string; big?: boolean }) {
  return (
    <div className={big ? 'stat big' : 'stat'}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {sub && <small className="muted">{sub}</small>}
    </div>
  );
}

interface CompareProps {
  rows: CompareRow[];
  current: PatternId;
  /** The compare rows are being recomputed in the background. */
  updating: boolean;
  onSelect: (pattern: PatternId) => void;
}

export function CompareTable({ rows, current, updating, onSelect }: CompareProps) {
  const lowest = Math.min(...rows.map((r) => r.order));

  return (
    <section className={`card${updating ? ' updating' : ''}`}>
      <h2>Compare patterns</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Pattern</th>
              <th>Full</th>
              <th>Cut</th>
              <th>Total</th>
              <th>Order</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const order = r.order;
              const classes = [r.pattern === current ? 'current' : '', order === lowest ? 'best' : '']
                .filter(Boolean)
                .join(' ');
              return (
                <tr key={r.pattern} className={classes} onClick={() => onSelect(r.pattern)}>
                  <td>
                    <button type="button" className="link">
                      {PATTERNS.find((p) => p.id === r.pattern)!.label}
                    </button>
                    {r.pattern === current && <span className="tag">current</span>}
                    {order === lowest && <span className="tag best">fewest</span>}
                  </td>
                  <td>{formatCount(r.full)}</td>
                  <td>{formatCount(r.cut)}</td>
                  <td>{formatCount(r.total)}</td>
                  <td><strong>{formatCount(order)}</strong></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
