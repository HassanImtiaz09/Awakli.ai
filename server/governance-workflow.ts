/**
 * Prompt 23 — Governance Workflow
 *
 * Manages the 3-seat governance committee review process for sample approval.
 * Unanimous approval required, any single veto rejects.
 */

// ─── Types ─────────────────────────────────────────────────────────────

export type CommitteeRole = "product_lead" | "ux_lead" | "skeptical_engineer";
export type VoteDecision = "approve" | "reject" | "veto" | "abstain";
export type ReviewStatus = "pending" | "in_review" | "approved" | "rejected" | "vetoed" | "escalated";

export interface CommitteeMember {
  role: CommitteeRole;
  reviewerId: string;
  name: string;
}

export interface Vote {
  role: CommitteeRole;
  reviewerId: string;
  decision: VoteDecision;
  comment: string;
  timestamp: number;
}

export interface ReviewSubmission {
  sampleId: number;
  archetypeId: string;
  tier: number;
  provider: string;
  genreVariant: string;
  storageUrl: string;
  submittedBy: string;
  submittedAt: number;
}

export interface ReviewRecord {
  submission: ReviewSubmission;
  votes: Vote[];
  status: ReviewStatus;
  round: number; // 1-3
  statusReason: string;
  resolvedAt: number | null;
}

export interface GovernanceStats {
  totalReviews: number;
  approved: number;
  rejected: number;
  vetoed: number;
  pending: number;
  escalated: number;
  approvalRate: number;
  vetoRate: number;
  avgReviewTimeMs: number;
}

// ─── Constants ─────────────────────────────────────────────────────────

export const COMMITTEE_ROLES: CommitteeRole[] = ["product_lead", "ux_lead", "skeptical_engineer"];
export const REQUIRED_VOTES = 3; // all 3 members must vote
export const MAX_ROUNDS = 3; // 3-round escalation before auto-reject

export const ROLE_LABELS: Record<CommitteeRole, string> = {
  product_lead: "Product Lead",
  ux_lead: "UX Lead",
  skeptical_engineer: "Skeptical Engineer",
};

export const DECISION_LABELS: Record<VoteDecision, string> = {
  approve: "Approved",
  reject: "Rejected",
  veto: "Vetoed",
  abstain: "Abstained",
};

export const STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: "Pending Review",
  in_review: "In Review",
  approved: "Approved",
  rejected: "Rejected",
  vetoed: "Vetoed (Single Veto)",
  escalated: "Escalated",
};

// ─── Core Workflow ─────────────────────────────────────────────────────

/**
 * Submit a sample for governance review.
 */
export function submitForReview(submission: ReviewSubmission): ReviewRecord {
  return {
    submission,
    votes: [],
    status: "pending",
    round: 1,
    statusReason: "Awaiting committee review.",
    resolvedAt: null,
  };
}

/**
 * Record a committee member's vote on a review.
 */
export function recordVote(
  review: ReviewRecord,
  vote: Vote,
): ReviewRecord {
  // Validate role
  if (!COMMITTEE_ROLES.includes(vote.role)) {
    return { ...review, statusReason: `Invalid committee role: ${vote.role}` };
  }

  // Check for duplicate vote in current round
  const existingVote = review.votes.find(
    v => v.role === vote.role && v.timestamp > (review.resolvedAt ?? 0)
  );
  if (existingVote) {
    return { ...review, statusReason: `${ROLE_LABELS[vote.role]} has already voted in round ${review.round}.` };
  }

  const updatedVotes = [...review.votes, vote];
  let updatedReview: ReviewRecord = { ...review, votes: updatedVotes, status: "in_review" };

  // Check for immediate veto
  if (vote.decision === "veto") {
    updatedReview = {
      ...updatedReview,
      status: "vetoed",
      statusReason: `Vetoed by ${ROLE_LABELS[vote.role]}: ${vote.comment}`,
      resolvedAt: Date.now(),
    };
    return updatedReview;
  }

  // Count votes for current round
  const roundVotes = updatedVotes.filter(v => {
    // Only count votes from the current round
    const roundStart = review.round === 1 ? 0 : (review.resolvedAt ?? 0);
    return v.timestamp > roundStart;
  });

  // Check if all members have voted
  const votedRoles = new Set(roundVotes.map(v => v.role));
  if (votedRoles.size >= REQUIRED_VOTES) {
    updatedReview = checkUnanimousApproval(updatedReview, roundVotes);
  }

  return updatedReview;
}

/**
 * Check if the review has unanimous approval.
 */
export function checkUnanimousApproval(
  review: ReviewRecord,
  roundVotes: Vote[],
): ReviewRecord {
  const approvals = roundVotes.filter(v => v.decision === "approve");
  const rejections = roundVotes.filter(v => v.decision === "reject");
  const vetoes = roundVotes.filter(v => v.decision === "veto");

  // Any veto = immediate rejection
  if (vetoes.length > 0) {
    return {
      ...review,
      status: "vetoed",
      statusReason: `Vetoed by ${vetoes.map(v => ROLE_LABELS[v.role]).join(", ")}.`,
      resolvedAt: Date.now(),
    };
  }

  // Unanimous approval
  if (approvals.length === REQUIRED_VOTES) {
    return {
      ...review,
      status: "approved",
      statusReason: "Unanimously approved by all committee members.",
      resolvedAt: Date.now(),
    };
  }

  // Any rejections = escalate to next round or reject
  if (rejections.length > 0) {
    if (review.round >= MAX_ROUNDS) {
      return {
        ...review,
        status: "rejected",
        statusReason: `Rejected after ${MAX_ROUNDS} rounds. Reasons: ${rejections.map(v => `${ROLE_LABELS[v.role]}: ${v.comment}`).join("; ")}`,
        resolvedAt: Date.now(),
      };
    }

    return {
      ...review,
      status: "escalated",
      round: review.round + 1,
      statusReason: `Escalated to round ${review.round + 1}. ${rejections.map(v => `${ROLE_LABELS[v.role]} rejected: ${v.comment}`).join("; ")}`,
      resolvedAt: Date.now(), // marks end of current round
    };
  }

  // Abstentions don't count as approval
  return {
    ...review,
    status: "in_review",
    statusReason: "Waiting for remaining votes.",
  };
}

/**
 * Veto a sample directly (shortcut for single-veto rejection).
 */
export function vetoSample(
  review: ReviewRecord,
  role: CommitteeRole,
  reviewerId: string,
  reason: string,
): ReviewRecord {
  return recordVote(review, {
    role,
    reviewerId,
    decision: "veto",
    comment: reason,
    timestamp: Date.now(),
  });
}

// ─── Statistics ────────────────────────────────────────────────────────

/**
 * Compute governance statistics from a set of review records.
 */
export function computeGovernanceStats(reviews: ReviewRecord[]): GovernanceStats {
  const total = reviews.length;
  const approved = reviews.filter(r => r.status === "approved").length;
  const rejected = reviews.filter(r => r.status === "rejected").length;
  const vetoed = reviews.filter(r => r.status === "vetoed").length;
  const pending = reviews.filter(r => r.status === "pending" || r.status === "in_review").length;
  const escalated = reviews.filter(r => r.status === "escalated").length;

  const resolved = reviews.filter(r => r.resolvedAt != null);
  const avgReviewTimeMs = resolved.length > 0
    ? resolved.reduce((sum, r) => sum + (r.resolvedAt! - r.submission.submittedAt), 0) / resolved.length
    : 0;

  return {
    totalReviews: total,
    approved,
    rejected,
    vetoed,
    pending,
    escalated,
    approvalRate: total > 0 ? Math.round((approved / total) * 100) / 100 : 0,
    vetoRate: total > 0 ? Math.round((vetoed / total) * 100) / 100 : 0,
    avgReviewTimeMs: Math.round(avgReviewTimeMs),
  };
}

/**
 * Get the default committee members.
 */
export function getDefaultCommittee(): CommitteeMember[] {
  return [
    { role: "product_lead", reviewerId: "pl_001", name: "Product Lead" },
    { role: "ux_lead", reviewerId: "ux_001", name: "UX Lead" },
    { role: "skeptical_engineer", reviewerId: "se_001", name: "Skeptical Engineer (Rotating)" },
  ];
}
