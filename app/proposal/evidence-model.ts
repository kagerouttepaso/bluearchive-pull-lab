export type TargetCount = 2 | 3 | 4;

export type CompletionStats = {
  mean: number;
  sd: number;
  p95: number;
  worst: number;
};

export type CompletionEvidence = {
  current: number[];
  proposal: number[];
  currentStats: CompletionStats;
  proposalStats: CompletionStats;
};

export type PayoutEvidence = {
  currentMean: number[];
  currentSd: number[];
  proposalMean: number[];
  proposalSd: number[];
};

export type ProposalEvidenceData = {
  completion: Record<TargetCount, CompletionEvidence>;
  payout: PayoutEvidence;
};

const MAX_PAID = 800;
const MAX_TOTAL = 900;
const CURRENT_PU_RATE = 0.007;
const TICKET_MILESTONES = new Set([70, 130, 150, 170, 270, 330, 350, 370]);

function makeTicketMaps() {
  const totalForPaid = new Array<number>(MAX_PAID + 1).fill(0);
  let total = 0;
  let tickets = 0;

  for (let paid = 1; paid <= MAX_PAID; paid += 1) {
    total += 1;
    if (TICKET_MILESTONES.has(total)) tickets += 10;
    while (tickets > 0) {
      tickets -= 1;
      total += 1;
      if (TICKET_MILESTONES.has(total)) tickets += 10;
    }
    totalForPaid[paid] = total;
  }

  return totalForPaid;
}

const TOTAL_FOR_PAID = makeTicketMaps();

function currentHitRate(nextCharge: number) {
  if (nextCharge === 200) return 1;
  if (nextCharge === 100) return 0.5;
  return CURRENT_PU_RATE;
}

function proposalHitRate(missStreak: number) {
  if (missStreak >= 100) return 0.009;
  if (missStreak >= 60) return 0.0075;
  return CURRENT_PU_RATE;
}

function isProposalVoucherPull(pull: number) {
  return pull >= 120 && (pull - 120) % 200 === 0;
}

function computeCurrentCompletion(target: TargetCount) {
  let state = Array.from({ length: target + 1 }, () => new Float64Array(200));
  state[0][0] = 1;
  const totalCdf = new Array<number>(MAX_TOTAL + 1).fill(0);

  for (let pull = 1; pull <= MAX_TOTAL; pull += 1) {
    const next = Array.from({ length: target + 1 }, () => new Float64Array(200));
    for (let count = 0; count <= target; count += 1) {
      for (let charge = 0; charge < 200; charge += 1) {
        const mass = state[count][charge];
        if (!mass) continue;
        if (count === target) {
          next[target][0] += mass;
          continue;
        }
        const nextCharge = charge + 1;
        const hitRate = currentHitRate(nextCharge);
        next[count + 1][0] += mass * hitRate;
        if (hitRate < 1) next[count][nextCharge] += mass * (1 - hitRate);
      }
    }
    state = next;
    totalCdf[pull] = state[target].reduce((sum, mass) => sum + mass, 0);
  }

  return Array.from({ length: MAX_PAID + 1 }, (_, paid) => totalCdf[TOTAL_FOR_PAID[paid]] ?? 0);
}

function computeProposalCompletion(target: TargetCount) {
  const width = MAX_PAID + 1;
  let state = Array.from({ length: target + 1 }, () => new Float64Array(width));
  state[0][0] = 1;
  const cdf = new Array<number>(MAX_PAID + 1).fill(0);

  for (let pull = 1; pull <= MAX_PAID; pull += 1) {
    let next = Array.from({ length: target + 1 }, () => new Float64Array(width));
    for (let count = 0; count <= target; count += 1) {
      for (let miss = 0; miss < width; miss += 1) {
        const mass = state[count][miss];
        if (!mass) continue;
        if (count === target) {
          next[target][0] += mass;
          continue;
        }
        const hitRate = proposalHitRate(miss);
        const hitCount = count + 1;
        next[hitCount][0] += mass * hitRate;
        next[count][Math.min(MAX_PAID, miss + 1)] += mass * (1 - hitRate);
      }
    }

    if (isProposalVoucherPull(pull)) {
      const afterVoucher = Array.from({ length: target + 1 }, () => new Float64Array(width));
      for (let count = 0; count <= target; count += 1) {
        for (let miss = 0; miss < width; miss += 1) {
          const mass = next[count][miss];
          if (!mass) continue;
          if (count === target) afterVoucher[target][0] += mass;
          else if (count + 1 === target) afterVoucher[target][0] += mass;
          else afterVoucher[count + 1][miss] += mass;
        }
      }
      next = afterVoucher;
    }

    state = next;
    cdf[pull] = state[target].reduce((sum, mass) => sum + mass, 0);
  }

  return cdf;
}

function completionStats(cdf: number[]): CompletionStats {
  let mean = 0;
  let secondMoment = 0;
  let previous = 0;
  let p95 = MAX_PAID;
  let worst = MAX_PAID;
  let foundP95 = false;
  let foundWorst = false;

  for (let paid = 1; paid <= MAX_PAID; paid += 1) {
    const probability = Math.max(0, cdf[paid] - previous);
    mean += probability * paid;
    secondMoment += probability * paid * paid;
    previous = cdf[paid];
    if (!foundP95 && cdf[paid] + 1e-12 >= 0.95) {
      p95 = paid;
      foundP95 = true;
    }
    if (!foundWorst && cdf[paid] + 1e-12 >= 1) {
      worst = paid;
      foundWorst = true;
    }
  }

  return {
    mean,
    sd: Math.sqrt(Math.max(0, secondMoment - mean * mean)),
    p95,
    worst,
  };
}

type MomentState = {
  probability: Float64Array;
  first: Float64Array;
  second: Float64Array;
};

function addMomentTransition(
  target: MomentState,
  index: number,
  probability: number,
  first: number,
  second: number,
  transitionProbability: number,
  reward: number,
) {
  if (!transitionProbability || !probability) return;
  target.probability[index] += probability * transitionProbability;
  target.first[index] += (first + reward * probability) * transitionProbability;
  target.second[index] += (second + 2 * reward * first + reward * reward * probability) * transitionProbability;
}

function aggregateMoments(state: MomentState) {
  const mean = state.first.reduce((sum, value) => sum + value, 0);
  const second = state.second.reduce((sum, value) => sum + value, 0);
  return { mean, sd: Math.sqrt(Math.max(0, second - mean * mean)) };
}

function computeCurrentPayout() {
  let state: MomentState = {
    probability: new Float64Array(200),
    first: new Float64Array(200),
    second: new Float64Array(200),
  };
  state.probability[0] = 1;

  const totalMean = new Array<number>(MAX_TOTAL + 1).fill(0);
  const totalSd = new Array<number>(MAX_TOTAL + 1).fill(0);

  for (let pull = 1; pull <= MAX_TOTAL; pull += 1) {
    const next: MomentState = {
      probability: new Float64Array(200),
      first: new Float64Array(200),
      second: new Float64Array(200),
    };
    for (let charge = 0; charge < 200; charge += 1) {
      const probability = state.probability[charge];
      if (!probability) continue;
      const nextCharge = charge + 1;
      const hitRate = currentHitRate(nextCharge);
      addMomentTransition(next, 0, probability, state.first[charge], state.second[charge], hitRate, 1);
      if (hitRate < 1) {
        addMomentTransition(next, nextCharge, probability, state.first[charge], state.second[charge], 1 - hitRate, 0);
      }
    }
    state = next;
    const moments = aggregateMoments(state);
    totalMean[pull] = moments.mean;
    totalSd[pull] = moments.sd;
  }

  return {
    mean: Array.from({ length: MAX_PAID + 1 }, (_, paid) => totalMean[TOTAL_FOR_PAID[paid]] ?? 0),
    sd: Array.from({ length: MAX_PAID + 1 }, (_, paid) => totalSd[TOTAL_FOR_PAID[paid]] ?? 0),
  };
}

function computeProposalPayout() {
  const targetCount = 4;
  const missWidth = MAX_PAID + 1;
  const stateWidth = (targetCount + 1) * missWidth;
  let state: MomentState = {
    probability: new Float64Array(stateWidth),
    first: new Float64Array(stateWidth),
    second: new Float64Array(stateWidth),
  };
  state.probability[0] = 1;
  const mean = new Array<number>(MAX_PAID + 1).fill(0);
  const sd = new Array<number>(MAX_PAID + 1).fill(0);

  const indexOf = (count: number, miss: number) => count * missWidth + miss;

  for (let pull = 1; pull <= MAX_PAID; pull += 1) {
    let next: MomentState = {
      probability: new Float64Array(stateWidth),
      first: new Float64Array(stateWidth),
      second: new Float64Array(stateWidth),
    };

    for (let count = 0; count <= targetCount; count += 1) {
      for (let miss = 0; miss < missWidth; miss += 1) {
        const index = indexOf(count, miss);
        const probability = state.probability[index];
        if (!probability) continue;
        const hitRate = count === targetCount ? CURRENT_PU_RATE : proposalHitRate(miss);
        const hitCount = Math.min(targetCount, count + 1);
        addMomentTransition(next, indexOf(hitCount, 0), probability, state.first[index], state.second[index], hitRate, 1);
        const missIndex = count === targetCount ? indexOf(targetCount, 0) : indexOf(count, Math.min(MAX_PAID, miss + 1));
        addMomentTransition(next, missIndex, probability, state.first[index], state.second[index], 1 - hitRate, 0);
      }
    }

    if (isProposalVoucherPull(pull)) {
      const afterVoucher: MomentState = {
        probability: new Float64Array(stateWidth),
        first: new Float64Array(stateWidth),
        second: new Float64Array(stateWidth),
      };
      for (let count = 0; count <= targetCount; count += 1) {
        for (let miss = 0; miss < missWidth; miss += 1) {
          const index = indexOf(count, miss);
          const probability = next.probability[index];
          if (!probability) continue;
          const voucherCount = Math.min(targetCount, count + 1);
          const voucherMiss = voucherCount === targetCount ? 0 : miss;
          addMomentTransition(
            afterVoucher,
            indexOf(voucherCount, voucherMiss),
            probability,
            next.first[index],
            next.second[index],
            1,
            1,
          );
        }
      }
      next = afterVoucher;
    }

    state = next;
    const moments = aggregateMoments(state);
    mean[pull] = moments.mean;
    sd[pull] = moments.sd;
  }

  return { mean, sd };
}

export function createProposalEvidenceData(): ProposalEvidenceData {
  const completion = {} as Record<TargetCount, CompletionEvidence>;
  for (const target of [2, 3, 4] as const) {
    const current = computeCurrentCompletion(target);
    const proposal = computeProposalCompletion(target);
    completion[target] = {
      current,
      proposal,
      currentStats: completionStats(current),
      proposalStats: completionStats(proposal),
    };
  }

  const currentPayout = computeCurrentPayout();
  const proposalPayout = computeProposalPayout();
  return {
    completion,
    payout: {
      currentMean: currentPayout.mean,
      currentSd: currentPayout.sd,
      proposalMean: proposalPayout.mean,
      proposalSd: proposalPayout.sd,
    },
  };
}
