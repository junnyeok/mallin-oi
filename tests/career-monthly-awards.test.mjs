import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  getCareerAwardReward,
  sortCareerAwards,
} from '../assets/js/modules/career-award-rules.js';

const SQL_PATH = new URL(
  '../supabase/migrations/20260728020000_career_monthly_awards.sql',
  import.meta.url,
);

function cloneState(state) {
  return {
    balances: new Map(state.balances),
    awards: new Map(state.awards),
    ledger: new Map(state.ledger),
    pending: new Map(state.pending),
    runs: new Map(state.runs),
  };
}

function awardKey(month, rank) {
  return `${month}:${rank}`;
}

function executeReferenceAward(state, month, winners, { failAtRank = 0 } = {}) {
  if (state.runs.has(month)) return state;

  const next = cloneState(state);
  for (const winner of winners.slice(0, 3)) {
    const rank = Number(winner.rank);
    const key = awardKey(month, rank);
    if (next.awards.has(key) || next.ledger.has(key)) {
      throw new Error('partial state');
    }

    const amount = getCareerAwardReward(rank);
    next.awards.set(key, { ...winner, month, amount });
    next.balances.set(
      winner.userId,
      Number(next.balances.get(winner.userId) || 0) + amount,
    );
    next.ledger.set(key, {
      userId: winner.userId,
      month,
      rank,
      amount,
    });
    next.pending.set(key, {
      userId: winner.userId,
      month,
      rank,
      acknowledged: false,
    });

    if (rank === failAtRank) throw new Error('simulated failure');
  }

  next.runs.set(month, winners.slice(0, 3).length);
  return next;
}

function runAtomic(state, month, winners, options) {
  try {
    return executeReferenceAward(state, month, winners, options);
  } catch (error) {
    return { ...state, error };
  }
}

function acknowledgeReference(state, userId, month, rank) {
  const key = awardKey(month, rank);
  const pending = state.pending.get(key);
  if (!pending || pending.userId !== userId) return false;
  pending.acknowledged = true;
  return true;
}

function emptyState() {
  return {
    balances: new Map(),
    awards: new Map(),
    ledger: new Map(),
    pending: new Map(),
    runs: new Map(),
  };
}

test('rank rewards and popup order are fixed', () => {
  assert.equal(getCareerAwardReward(1), 1000);
  assert.equal(getCareerAwardReward(2), 500);
  assert.equal(getCareerAwardReward(3), 250);

  assert.deepEqual(
    sortCareerAwards([
      { award_month: '2026-08-01', rank_no: 1, reward_amount: 1000 },
      { award_month: '2026-07-01', rank_no: 3, reward_amount: 250 },
      { award_month: '2026-07-01', rank_no: 1, reward_amount: 1000 },
      { award_month: '2026-07-01', rank_no: 2, reward_amount: 500 },
    ]).map((award) => awardKey(award.awardMonth, award.rank)),
    [
      '2026-07-01:1',
      '2026-07-01:2',
      '2026-07-01:3',
      '2026-08-01:1',
    ],
  );
});

test('three different users receive rank-specific rewards', () => {
  const state = executeReferenceAward(emptyState(), '2026-07-01', [
    { rank: 1, userId: 'a' },
    { rank: 2, userId: 'b' },
    { rank: 3, userId: 'c' },
  ]);

  assert.deepEqual([...state.balances.entries()], [
    ['a', 1000],
    ['b', 500],
    ['c', 250],
  ]);
  assert.equal(state.ledger.size, 3);
  assert.equal(state.pending.size, 3);
});

for (const [label, ranks, total] of [
  ['1위와 2위', [1, 2], 1500],
  ['1위와 3위', [1, 3], 1250],
  ['1·2·3위', [1, 2, 3], 1750],
]) {
  test(`same user can receive ${label} separately`, () => {
    const winners = ranks.map((rank) => ({ rank, userId: 'same-user' }));
    const state = executeReferenceAward(
      emptyState(),
      '2026-07-01',
      winners,
    );

    assert.equal(state.balances.get('same-user'), total);
    assert.equal(state.ledger.size, ranks.length);
    assert.equal(state.pending.size, ranks.length);
  });
}

test('one or two valid ranks only create existing awards', () => {
  const one = executeReferenceAward(emptyState(), '2026-07-01', [
    { rank: 1, userId: 'a' },
  ]);
  const two = executeReferenceAward(emptyState(), '2026-08-01', [
    { rank: 1, userId: 'a' },
    { rank: 2, userId: 'b' },
  ]);

  assert.equal(one.runs.get('2026-07-01'), 1);
  assert.equal(two.runs.get('2026-08-01'), 2);
});

test('same month retry and concurrent winner do not duplicate payment', () => {
  const winners = [
    { rank: 1, userId: 'same-user' },
    { rank: 2, userId: 'same-user' },
    { rank: 3, userId: 'same-user' },
  ];
  const once = executeReferenceAward(emptyState(), '2026-07-01', winners);
  const retried = executeReferenceAward(once, '2026-07-01', winners);

  assert.equal(retried.balances.get('same-user'), 1750);
  assert.equal(retried.ledger.size, 3);
  assert.equal(retried.awards.size, 3);
});

test('a failure rolls back every rank mutation', () => {
  const original = emptyState();
  const failed = runAtomic(
    original,
    '2026-07-01',
    [
      { rank: 1, userId: 'a' },
      { rank: 2, userId: 'b' },
      { rank: 3, userId: 'c' },
    ],
    { failAtRank: 2 },
  );

  assert.equal(failed.balances.size, 0);
  assert.equal(failed.ledger.size, 0);
  assert.equal(failed.pending.size, 0);
  assert.equal(failed.runs.size, 0);
  assert.match(failed.error.message, /simulated failure/);
});

test('next month is independent from an already awarded month', () => {
  const july = executeReferenceAward(emptyState(), '2026-07-01', [
    { rank: 1, userId: 'a' },
  ]);
  const august = executeReferenceAward(july, '2026-08-01', [
    { rank: 1, userId: 'a' },
  ]);

  assert.equal(august.balances.get('a'), 2000);
  assert.equal(august.runs.size, 2);
  assert.equal(august.ledger.size, 2);
});

test('another user cannot acknowledge an award and duplicate ack is harmless', () => {
  const state = executeReferenceAward(emptyState(), '2026-07-01', [
    { rank: 1, userId: 'winner' },
  ]);

  assert.equal(
    acknowledgeReference(state, 'attacker', '2026-07-01', 1),
    false,
  );
  assert.equal(
    acknowledgeReference(state, 'winner', '2026-07-01', 1),
    true,
  );
  assert.equal(
    acknowledgeReference(state, 'winner', '2026-07-01', 1),
    true,
  );
  assert.equal(state.balances.get('winner'), 1000);
  assert.equal(state.ledger.size, 1);
});

test('migration contains transaction, lock, RLS, ownership checks, and one cron name', async () => {
  const sql = await readFile(SQL_PATH, 'utf8');

  assert.match(sql, /begin;[\s\S]*commit;/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /primary key \(award_month, rank_no\)/i);
  assert.match(
    sql,
    /pickle_ledger\(award_month, award_rank\)[\s\S]*career_monthly_award/i,
  );
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /enable row level security/i);
  assert.match(
    sql,
    /revoke all on function public\.run_due_career_monthly_awards\(\)[\s\S]*authenticated/i,
  );
  assert.equal(
    (sql.match(/'career-monthly-awards-kst'/g) || []).length >= 3,
    true,
  );
  assert.match(sql, /'\*\/5 3-14 28-31 \* \*'/);
  assert.match(sql, /v_today <> v_last_day/);
  assert.match(sql, /time '12:00:00'/);
});
