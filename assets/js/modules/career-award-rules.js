export const CAREER_AWARD_REWARDS = Object.freeze({
  1: 1000,
  2: 500,
  3: 250,
});

export const CAREER_AWARD_IMAGES = Object.freeze({
  1: './images/reward/reward-career-1st.png',
  2: './images/reward/reward-career-2nd.png',
  3: './images/reward/reward-career-3nd.png',
});

export function getCareerAwardReward(rank) {
  return Number(CAREER_AWARD_REWARDS[Number(rank)] || 0);
}

export function normalizeCareerAward(row) {
  const rank = Number(row?.rank_no ?? row?.rankNo);
  const rewardAmount = Number(
    row?.reward_amount ?? row?.rewardAmount ?? getCareerAwardReward(rank),
  );
  const awardMonth = String(row?.award_month ?? row?.awardMonth ?? '').slice(
    0,
    10,
  );

  if (
    ![1, 2, 3].includes(rank) ||
    !/^\d{4}-\d{2}-01$/.test(awardMonth) ||
    rewardAmount !== getCareerAwardReward(rank)
  ) {
    return null;
  }

  return {
    awardMonth,
    rank,
    rewardAmount,
    awardedAt: String(row?.awarded_at ?? row?.awardedAt ?? ''),
  };
}

export function sortCareerAwards(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map(normalizeCareerAward)
    .filter(Boolean)
    .sort((a, b) => {
      const monthOrder = a.awardMonth.localeCompare(b.awardMonth);
      if (monthOrder !== 0) return monthOrder;
      return a.rank - b.rank;
    });
}

export function formatCareerAwardMonth(awardMonth) {
  const match = /^(\d{4})-(\d{2})-01$/.exec(String(awardMonth || ''));
  if (!match) return { year: 0, month: 0, label: '' };

  const year = Number(match[1]);
  const month = Number(match[2]);
  return {
    year,
    month,
    label: `${year}년 ${month}월`,
  };
}
