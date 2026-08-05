import type {ParkingTask} from '../../../context/AppStateContext';
import {canRun, isEscalated as ownershipIsEscalated} from '../services/OwnershipService';
import {agoLabel} from '../../../utils/retrievalClocks';

/**
 * Replaces the ~8 independent booleans (needsDriver, isMine, isEscalated,
 * claimedByOther, awaitingAccept, needsConfirm, recalled, canRecall,
 * canDispatch) that ValetHomeScreen's renderJobCard used to compute
 * inline to pick 1-of-N action states. Ported verbatim — every branch
 * below reproduces the exact same condition the JSX used to check, just
 * named and centralized instead of re-derived per render.
 *
 * The Dashboard's card actually renders TWO kinds of "needs a driver"
 * state with different affordances (an unclaimed retrieval request just
 * offers Assign driver; an assigned-but-unstaffed park job also offers
 * Cancel job, or shows a locked note if another valet already holds it),
 * so those stay as distinct JobActionKind variants rather than one
 * generic "assign" — collapsing them would have changed which buttons
 * appear.
 */
export type JobActionKind =
  | 'assign_retrieval_request' // status requested/accepted — always offer Assign driver, no cancel
  | 'locked'                    // assigned, no driver, owned by someone else, not escalated
  | 'assign_or_cancel'          // assigned, no driver, mine (or open floor) to staff
  | 'awaiting_accept'           // assigned, has driver, driver hasn't accepted yet
  | 'key_handover'              // assigned, has driver, accepted, park type — ready for key handover
  | 'confirm_handover'          // status delivered — awaiting the valet's handover confirmation
  | 'none';                     // in_transit/key_collected, or a status with no primary action here

export interface JobActionResult {
  kind: JobActionKind;
  isMine: boolean;
  isEscalated: boolean;
  /** Only set when kind === 'locked'. */
  lockedByName: string | null;
  /** Only set when kind === 'confirm_handover'. */
  wasRecalled: boolean;
  /** Independent of `kind` — a park job mid-trip can be recalled regardless
   *  of what else is shown. */
  canRecall: boolean;
  /** Independent read-only note: a recalled car still en route back. */
  isRecalledInTransit: boolean;
  /** The small status line under the plate ("Driver has the key", "Waiting
   *  for X to accept…", etc) — null when isEscalated (the escalation
   *  banner replaces it, same as before). */
  waitingNote: string | null;
}

export function deriveJobAction(
  t: ParkingTask,
  ctx: {myValetId: number | null | undefined; myUserId: number | undefined; now: number},
): JobActionResult {
  const needsDriver = t.status === 'assigned' && !t.driverId;
  const isMine = t.valetId === ctx.myUserId;
  const escalated = !!t.escalatedAt && needsDriver;
  const claimedByOther = !!t.valetId && !isMine && !t.escalatedAt;
  const awaitingAccept = t.status === 'assigned' && !!t.driverId && !t.acceptedAt;
  const needsConfirm = t.status === 'delivered';
  const recalled = !!t.recalledAt;
  const canDispatch = canRun(t, ctx.myValetId);
  const canRecall = canDispatch && t.type === 'park' && !recalled
    && (t.status === 'key_collected' || t.status === 'in_transit');
  const isRecalledInTransit = recalled && (t.status === 'key_collected' || t.status === 'in_transit');

  // How long a job's been sitting without a driver has real operational
  // weight — travel time to wherever it actually gets parked varies job to
  // job, so nothing else tells a valet which unclaimed job has been
  // waiting longest. Was silently missing before: a job used to always
  // walk straight into assignment in the same motion it was created, so
  // "how long has it been waiting" never had to be shown.
  const waitedSince = t.type === 'retrieve' ? t.requestedAt : t.assignedAt;
  const waitingNote =
      awaitingAccept ? `Waiting for ${t.driverName ?? 'driver'} to accept…`
    : recalled && t.status !== 'delivered' ? `${t.driverName ?? 'Driver'} is bringing it back`
    : t.status === 'key_collected' ? `${t.driverName ?? 'Driver'} has the key`
    : t.status === 'in_transit' ? (t.type === 'park' ? `${t.driverName ?? 'Driver'} is parking it` : `${t.driverName ?? 'Driver'} is bringing it`)
    : (needsDriver || t.status === 'requested' || t.status === 'accepted')
      ? `Waiting for a driver · ${agoLabel(waitedSince, ctx.now)}`
    : null;

  let kind: JobActionKind = 'none';
  if (t.status === 'requested' || t.status === 'accepted') {
    kind = 'assign_retrieval_request';
  } else if (needsDriver && claimedByOther) {
    kind = 'locked';
  } else if (needsDriver && !claimedByOther) {
    kind = 'assign_or_cancel';
  } else if (t.status === 'assigned' && !needsDriver && t.type === 'park') {
    kind = awaitingAccept ? 'awaiting_accept' : 'key_handover';
  } else if (needsConfirm) {
    kind = 'confirm_handover';
  }

  return {
    kind,
    isMine,
    isEscalated: escalated,
    lockedByName: kind === 'locked' ? (t.valetName ?? 'Another valet') : null,
    wasRecalled: recalled,
    canRecall,
    isRecalledInTransit,
    waitingNote: escalated ? null : waitingNote,
  };
}

// Ownership-side helper re-exported here too — deriveJobAction's callers
// (the card renderer) already need it for the YOURS/valet-name badge.
export {ownershipIsEscalated};
