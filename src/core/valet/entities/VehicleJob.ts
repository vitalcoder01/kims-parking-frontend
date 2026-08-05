import type {ParkingTask, Visitor} from '../../../context/AppStateContext';

/**
 * Phase 1 architecture note (see VALET_ARCHITECTURE_REFACTOR.md):
 *
 * ParkingTask and Visitor represent the same underlying vehicle lifecycle
 * (park -> parked -> retrieve) but genuinely branch differently in several
 * places that matter for correctness — a Visitor's "in transit" state is
 * read off `pickedUpAt`/`retrievalRequested` flags on ONE row, while a
 * staff ParkingTask's is read off `status`/`driverId` across what is
 * really two separate rows (a park task, then later a retrieve task) that
 * happen to share a doctorId. Forcing every predicate through one fully
 * generic shape right now would mean either losing that distinction or
 * inventing behavior that didn't exist before — exactly what the refactor
 * plan's own rule says not to risk ("preserve exact behavior... prioritize
 * compatibility over architectural purity").
 *
 * So VehicleJob here is deliberately a *lightweight display/identity
 * summary* — the fields that mean the same thing regardless of which
 * concrete record backs them — used where that's genuinely all that's
 * needed (e.g. "what's this job's plate/slot/driver, for a generic
 * label"). The selectors and services alongside this file mostly still
 * operate on ParkingTask/Visitor directly, because their real logic does
 * NOT reduce to one shared shape without changing behavior. Where it
 * doesn't, we keep two clearly-named, co-located functions instead of one
 * function that would silently drift the two record types apart.
 */
export type VehicleJobKind = 'staff-park' | 'staff-retrieve' | 'visitor';

export interface VehicleJob {
  kind: VehicleJobKind;
  id: number;
  personName: string;
  carNumber?: string;
  slotId?: string;
  driverId?: number;
  driverName?: string;
  valetId?: number;
  valetName?: string;
  escalatedAt?: number;
  /** The concrete record this was adapted from — escape hatch for any
   *  screen that still needs a field this summary doesn't carry. */
  source: ParkingTask | Visitor;
}

export function fromTask(t: ParkingTask): VehicleJob {
  return {
    kind: t.type === 'park' ? 'staff-park' : 'staff-retrieve',
    id: t.id,
    personName: t.doctorName,
    carNumber: t.carNumber,
    slotId: t.slotId,
    driverId: t.driverId,
    driverName: t.driverName,
    valetId: t.valetId,
    valetName: t.valetName,
    escalatedAt: t.escalatedAt,
    source: t,
  };
}

export function fromVisitor(v: Visitor): VehicleJob {
  return {
    kind: 'visitor',
    id: v.id,
    personName: v.name || 'Visitor',
    carNumber: v.carNumber,
    slotId: v.slotId,
    driverId: v.driverId,
    driverName: v.driverName,
    valetId: v.valetId,
    escalatedAt: v.escalatedAt,
    source: v,
  };
}

export function isTaskJob(job: VehicleJob): job is VehicleJob & {source: ParkingTask} {
  return job.kind !== 'visitor';
}

export function isVisitorJob(job: VehicleJob): job is VehicleJob & {source: Visitor} {
  return job.kind === 'visitor';
}
