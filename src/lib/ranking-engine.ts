export type Aggregation = "min" | "max" | "sum" | "average" | "best_n_sum" | "final_only" | "position_points";
export type Direction = "asc" | "desc";

export type RoundValue = {
  roundId: string;
  roundNumber: number;
  value: number;
  adjustment?: number;
  status?: "valid" | "dns" | "dnf" | "dsq" | "void";
  weight?: number;
};

export type Rule = {
  aggregation: Aggregation;
  direction: Direction;
  bestN?: number;
  positionPoints?: Record<string, number>;
};


export type AttemptAggregation = "min" | "max" | "latest" | "sum" | "average";
export type AttemptValue = { value: number; adjustment?: number; attemptNumber: number; recordedAt?: Date };

export function aggregateAttempts(source: AttemptValue[], mode: AttemptAggregation): number | null {
  const valid = source.filter((x) => Number.isFinite(x.value + (x.adjustment ?? 0)));
  if (!valid.length) return null;
  const adjusted = (x: AttemptValue) => x.value + (x.adjustment ?? 0);
  if (mode === "min") return Math.min(...valid.map(adjusted));
  if (mode === "max") return Math.max(...valid.map(adjusted));
  if (mode === "sum") return valid.reduce((s, x) => s + adjusted(x), 0);
  if (mode === "average") return valid.reduce((s, x) => s + adjusted(x), 0) / valid.length;
  const latest = [...valid].sort((a, b) => b.attemptNumber - a.attemptNumber || (b.recordedAt?.getTime() ?? 0) - (a.recordedAt?.getTime() ?? 0))[0];
  return adjusted(latest);
}

export type PlayerCalculation = {
  playerId: string;
  value: number;
  rounds: Array<RoundValue & { adjustedValue: number; counted: boolean }>;
};

const valid = (r: RoundValue) => (r.status ?? "valid") === "valid" && Number.isFinite(r.value);

export function calculatePlayer(playerId: string, source: RoundValue[], rule: Rule): PlayerCalculation | null {
  const normalized = source
    .filter(valid)
    .map((r) => ({ ...r, adjustedValue: (r.value + (r.adjustment ?? 0)) * (r.weight ?? 1), counted: false }))
    .sort((a, b) => a.roundNumber - b.roundNumber);

  if (!normalized.length) return null;

  let value = 0;
  let countedIndexes: number[] = [];

  switch (rule.aggregation) {
    case "min": {
      const min = Math.min(...normalized.map((r) => r.adjustedValue));
      const idx = normalized.findIndex((r) => r.adjustedValue === min);
      value = min; countedIndexes = [idx]; break;
    }
    case "max": {
      const max = Math.max(...normalized.map((r) => r.adjustedValue));
      const idx = normalized.findIndex((r) => r.adjustedValue === max);
      value = max; countedIndexes = [idx]; break;
    }
    case "sum":
      value = normalized.reduce((s, r) => s + r.adjustedValue, 0);
      countedIndexes = normalized.map((_, i) => i);
      break;
    case "average":
      value = normalized.reduce((s, r) => s + r.adjustedValue, 0) / normalized.length;
      countedIndexes = normalized.map((_, i) => i);
      break;
    case "best_n_sum": {
      const n = Math.max(1, Math.min(rule.bestN ?? 1, normalized.length));
      const indexed = normalized.map((r, i) => ({ i, v: r.adjustedValue }));
      indexed.sort((a, b) => rule.direction === "desc" ? b.v - a.v : a.v - b.v);
      countedIndexes = indexed.slice(0, n).map((x) => x.i);
      value = countedIndexes.reduce((s, i) => s + normalized[i].adjustedValue, 0);
      break;
    }
    case "final_only": {
      const idx = normalized.reduce((best, r, i) => r.roundNumber >= normalized[best].roundNumber ? i : best, 0);
      value = normalized[idx].adjustedValue; countedIndexes = [idx]; break;
    }
    case "position_points": {
      value = normalized.reduce((sum, r, i) => {
        countedIndexes.push(i);
        return sum + (rule.positionPoints?.[String(Math.trunc(r.value))] ?? 0);
      }, 0);
      break;
    }
  }

  const counted = new Set(countedIndexes);
  return { playerId, value, rounds: normalized.map((r, i) => ({ ...r, counted: counted.has(i) })) };
}


export type ScopeCompetitionResult = { competitionId: string; rank: number; points: number; counted?: boolean };

export function calculateScopePoints(items: ScopeCompetitionResult[], dropLowest = 0, minCompetitions = 0) {
  if (items.length < minCompetitions) return null;
  const sorted = [...items].sort((a, b) => b.points - a.points || a.rank - b.rank);
  const keep = Math.max(0, sorted.length - Math.max(0, dropLowest));
  const competitions = sorted.map((item, index) => ({ ...item, counted: index < keep }));
  const value = competitions.filter((x) => x.counted).reduce((sum, x) => sum + x.points, 0);
  return { value, competitions };
}

export function rankPlayers(calculations: PlayerCalculation[], direction: Direction) {
  const sorted = [...calculations].sort((a, b) => direction === "asc" ? a.value - b.value : b.value - a.value);
  let previous: number | undefined;
  let previousRank = 0;
  return sorted.map((entry, index) => {
    const rank = previous !== undefined && entry.value === previous ? previousRank : index + 1;
    previous = entry.value;
    previousRank = rank;
    return { ...entry, rank };
  });
}
