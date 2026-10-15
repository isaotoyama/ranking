import assert from "node:assert/strict";
import { aggregateAttempts, calculatePlayer, calculateScopePoints, rankPlayers } from "../src/lib/ranking-engine";

const rounds = [82, 91, 87, 96, 88, 83].map((value, i) => ({ roundId: `r${i+1}`, roundNumber: i+1, value }));
assert.equal(calculatePlayer("p1", rounds, { aggregation: "max", direction: "desc" })?.value, 96);
assert.equal(calculatePlayer("p1", rounds, { aggregation: "sum", direction: "desc" })?.value, 527);
assert.equal(calculatePlayer("p1", rounds, { aggregation: "best_n_sum", direction: "desc", bestN: 3 })?.value, 275);
const speed = [44.502,43.81,42.992,42.381,42.71,43.122].map((value,i)=>({roundId:`s${i}`,roundNumber:i+1,value}));
assert.equal(calculatePlayer("p1", speed, { aggregation: "min", direction: "asc" })?.value, 42.381);
const ranked = rankPlayers([
  { playerId:"a", value:95, rounds:[] },
  { playerId:"b", value:91, rounds:[] },
  { playerId:"c", value:91, rounds:[] },
], "desc");
assert.deepEqual(ranked.map(x=>x.rank), [1,2,2]);
assert.equal(aggregateAttempts([{value:10,attemptNumber:1},{value:8,attemptNumber:2}],"min"),8);
assert.equal(aggregateAttempts([{value:10,attemptNumber:1},{value:12,attemptNumber:2}],"latest"),12);
const scope = calculateScopePoints([{competitionId:"a",rank:1,points:25},{competitionId:"b",rank:2,points:18},{competitionId:"c",rank:5,points:10}],1,2);
assert.equal(scope?.value,43);
assert.deepEqual(scope?.competitions.map(x=>x.counted),[true,true,false]);
console.log("ranking engine tests passed");
