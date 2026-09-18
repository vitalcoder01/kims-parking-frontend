import type {ParkingTask} from '../../../context/AppStateContext';

/**
 * Every ownership rule the valet module has, in one place. Ported verbatim
 * from useValetActions.ts's isMyJobToRun/isMyRetrieval and the inline
 * `claimable` check in ValetHomeScreen.handleAssignDriverTo — behavior is
 * unchanged, only the location and (for canClaim) the name.
 *
 * Ownership is genuinely two separate, overlapping concepts on a
 * ParkingTask — this service keeps them as two functions rather than
 * collapsing them into one, because they answer different questions and
 * the plan's own success criteria says not to blur behavior for the sake
 * of a tidier API:
 *   - valetId/escalatedAt: who's running THIS JOB right now (canRun).
 *   - retrievalOwnerValetId/arrivalOwnerValetId/recoveryBroadcastAt: who
 *     owns the doctor's whole SESSION, which gates whether an unclaimed
 *     retrieval request is even visible to a given valet (canView).
 */

/** Who is currently dispatching this job (assign driver / key handover /
 *  recall), if anyone. Mirrors the backend's own valetId field — this is
 *  just "read it back", not a computed rule. */
export function getOwnerValetId(t: ParkingTask): number | null {
  return t.valetId ?? null;
}

/** True if `myValetId` is allowed to act on this job right now — assign a
 *  driver, mark the key collected, recall it. An escalated job (stalled
 *  past its owner) opens back up to everyone; an unowned job was never
 *  anyone's alone. */
export function canRun(t: ParkingTask, myValetId: number | null | undefined): boolean {
  if (t.valetId == null) return true;
  if (t.valetId === myValetId) return true;
  const needsDriver = t.status === 'assigned' && !t.driverId;
  return !!t.escalatedAt && needsDriver;
}

/** True if a retrieval request should even be VISIBLE to `myValetId` — the
 *  session-ownership gate, distinct from canRun above. Mirrors
 *  isVisibleToValet() in the backend's task.service.js, station-awareness
 *  included: a gate-station owner never personally holds this visibility
 *  either (see that function's own comment for the full reasoning and the
 *  real report this came from — a lot valet whose Retrieval Requests count
 *  stayed at 0 because this client-side mirror kept the request filtered
 *  out even after the backend started sending it). arrivalOwnerValetStation/
 *  retrievalOwnerValetStation are denormalized onto the task itself
 *  (serializeTask) precisely so this check needs no separate lookup. */
export function canView(t: ParkingTask, myValetId: number | null | undefined): boolean {
  const owner = t.retrievalOwnerValetId ?? t.arrivalOwnerValetId;
  if (owner == null) return true;                       // never owned — open floor
  if (owner === myValetId) return true;                 // mine
  const ownerStation = t.retrievalOwnerValetId != null ? t.retrievalOwnerValetStation : t.arrivalOwnerValetStation;
  if (ownerStation === 'gate') return true;
  if (t.retrievalOwnerValetId != null) return t.escalatedAt != null;
  return t.recoveryBroadcastAt != null || t.escalatedAt != null;
}

/** True if `myValetId` tapping "Assign driver" on this retrieval should
 *  ALSO fire the accept-retrieval claim first (see
 *  ValetHomeScreen.handleAssignDriverTo for why claiming happens
 *  synchronously with opening the driver picker, not before it). Only
 *  retrieve jobs have a claim step — a park job has no retrieval to
 *  accept. */
export function canClaim(t: ParkingTask, myValetId: number | null | undefined): boolean {
  return t.type === 'retrieve'
    && myValetId != null
    && (t.status === 'requested' || t.status === 'accepted')
    && t.retrievalOwnerValetId !== myValetId;
}

/** Two-station handoff: whether `myStation` may actually ASSIGN A DRIVER to
 *  this retrieval request right now — distinct from canView (merely seeing
 *  it) and from canClaim (whether tapping fires the claim call). A
 *  gate-station arrival owner is visible on this request (canView) but was
 *  never a real claimant of it: they hand keys to drivers, they don't stand
 *  next to a parked car to assign one, so the lot valet is who should act.
 *  Mirrors the backend's own backstop for the same rule in
 *  task.service.js's assignDriver and jobAlerts.js's claimRetrieval — this
 *  is what keeps the UI from ever offering an action the server will now
 *  refuse.
 *
 *  Opens to the gate side once: it's already personally theirs, the whole
 *  team has been opened up (escalation/recovery), the lot side has punted
 *  it back via "No driver here" (the one and only path that leaves a
 *  retrieve task at status 'accepted' with no retrievalOwnerValetId —
 *  every other unclaimed state is 'requested'), or this particular session
 *  was never gate-routed to begin with. */
export function canAssignRetrieval(t: ParkingTask, myValetId: number | null | undefined, myStation: 'gate' | 'lot' | null | undefined): boolean {
  if (t.type !== 'retrieve') return true;
  if (myValetId != null && t.retrievalOwnerValetId === myValetId) return true;
  if (t.escalatedAt != null || t.recoveryBroadcastAt != null) return true;
  if (t.retrievalOwnerValetId == null && t.status === 'accepted') return true; // punted back
  if (t.arrivalOwnerValetStation !== 'gate') return true; // not gate-routed at all
  return myStation !== 'gate';
}

/** Read-only: has this job stalled past its owner and opened to the team?
 *  (The escalation decision itself is the backend watchdog's — this just
 *  reads the flag it sets.) */
export function isEscalated(t: ParkingTask): boolean {
  return t.escalatedAt != null;
}

/** Read-only: did the session owner's response window lapse, releasing
 *  this retrieval to every valet? (Same caveat as isEscalated — the
 *  backend decides, this reads the result.) */
export function isUnderRecovery(t: ParkingTask): boolean {
  return t.recoveryBroadcastAt != null;
}

/** Two-station handoff model: whether this job counts as "mine" on the
 *  Dashboard's My Jobs / Team Jobs split, on top of canRun's ownership
 *  check. A gate valet's park job keeps valetId (and so canRun/"mine")
 *  pointing at the gate valet for its whole life — write-once, by design,
 *  it's the record of who ran the arrival. But once that job is out with a
 *  driver, finishing it is the LOT valet's job right now, not the gate
 *  valet's — and the mirror is true for a gate valet confirming a
 *  retrieval has arrived. Without this, canRun's strict valetId ownership
 *  buried a card asking a specific valet for action under Team Jobs,
 *  reading as background noise about someone else's job instead of a
 *  clear, prominent thing to do — the exact report that led here: a lot
 *  valet couldn't find anything to act on after a gate handoff, because it
 *  never showed under My Jobs. Purely a display grouping, not a
 *  permission — confirmParkedByValet/confirmArrivedByValet were always
 *  callable regardless of this split; this only makes them easy to find. */
export function isMyStationJob(t: ParkingTask, myStation: 'gate' | 'lot' | null | undefined): boolean {
  if (myStation === 'lot') {
    return (t.type === 'park' && (t.status === 'key_collected' || t.status === 'in_transit'))
      // Two-station handoff: an unclaimed retrieval routed to the lot
      // (arrival owner is gate-station) is the lot valet's to STAFF —
      // it belongs in their Dashboard's My Jobs > Driver assign pending
      // capsule, not buried under Team Jobs. Without this, a fresh
      // gate-raised retrieval request appeared in Team Jobs on the lot
      // valet's screen even though the lot valet was the one meant to
      // assign a driver, and the "task landed in the wrong capsule"
      // report followed directly from that. 'requested' and 'accepted'
      // are the two unclaimed states — every other retrieve status
      // already implies a claim.
      || (t.type === 'retrieve'
          && (t.status === 'requested' || t.status === 'accepted')
          && !t.retrievalOwnerValetId
          && t.arrivalOwnerValetStation === 'gate');
  }
  if (myStation === 'gate') {
    // 'assigned' is the real state now — no GPS left to ever advance a
    // retrieval into 'in_transit' (see task.service.js's widened
    // assertTransition), so checking that alone meant this NEVER matched:
    // a gate valet's own retrieval confirmations stayed buried in Team
    // Jobs forever, on top of the confirm-arrived button itself being
    // unreachable for the same reason (see ValetHomeScreen). 'in_transit'
    // stays checked too for any task that predates this change.
    return t.type === 'retrieve' && !!t.driverId && (t.status === 'assigned' || t.status === 'in_transit');
  }
  return false;
}

// Backward-compatible aliases — useValetActions.ts re-exports these under
// their original names so no call site elsewhere has to change.
export const isMyJobToRun = canRun;
export const isMyRetrieval = canView;
