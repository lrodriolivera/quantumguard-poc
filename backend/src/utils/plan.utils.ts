/**
 * Plan / quota rules for the "firma simple" product (Free / Basic / Pro),
 * modelled on the market standard in Chile (FirmaYa) and Colombia.
 */

import { Op } from 'sequelize';
import { Document } from '../models/document.model';
import { Signature } from '../models/signature.model';

export const PLANS = ['free', 'basic', 'pro'] as const;
export type Plan = (typeof PLANS)[number];

export interface PlanLimits {
  /** Signature events per calendar month (each signer's signature counts 1). */
  monthlySignatures: number;
  /** Can invite people other than the account owner to sign. */
  canInviteSigners: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { monthlySignatures: 5, canInviteSigners: false },
  basic: { monthlySignatures: 30, canInviteSigners: true },
  pro: { monthlySignatures: 100, canInviteSigners: true },
};

export function isPlan(value: unknown): value is Plan {
  return typeof value === 'string' && (PLANS as readonly string[]).includes(value);
}

export function planLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[isPlan(plan) ? plan : 'free'];
}

/** Calendar-month billing window in UTC: simplest rule, matches the Free tier
 * (no Stripe subscription to anchor a period to) and is good enough for paid
 * tiers until real billing-cycle anchoring is wired up. */
export function currentPeriodStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Every completed signature on a document the user owns, this period. */
export async function countSignaturesThisPeriod(ownerUserId: string, now: Date = new Date()): Promise<number> {
  return Signature.count({
    where: { created_at: { [Op.gte]: currentPeriodStart(now) } },
    include: [{ model: Document, as: 'document', where: { user_id: ownerUserId }, attributes: [] }],
  });
}

export class QuotaExceededError extends Error {
  constructor(public readonly limit: number, public readonly plan: Plan) {
    super(`Monthly signature quota exceeded (${limit}/month on the ${plan} plan)`);
  }
}

/** Throws QuotaExceededError if signing one more document would exceed the plan. */
export async function assertWithinSignatureQuota(ownerUserId: string, plan: string): Promise<void> {
  const limits = planLimits(plan);
  const used = await countSignaturesThisPeriod(ownerUserId);
  if (used >= limits.monthlySignatures) {
    throw new QuotaExceededError(limits.monthlySignatures, isPlan(plan) ? plan : 'free');
  }
}
