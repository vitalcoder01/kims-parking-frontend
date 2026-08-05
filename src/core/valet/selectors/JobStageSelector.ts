import type {ParkingTask, Visitor} from '../../../context/AppStateContext';

/**
 * The Jobs page's "Active" sub-filter stages — ported verbatim from
 * ValetRecordsScreen's inline visitorStage/staffStage functions. Same 4
 * stages, same meaning, for either record shape.
 *
 * Kept as two functions rather than one generic `stageOf(job)` over
 * VehicleJob: a Visitor's stage reads driverAssignedAt/pickedUpAt/
 * retrievalRequested off ONE row, while a staff ParkingTask's reads
 * status/driverId off what's really either a park row or a retrieve row
 * for that doctor — genuinely different data shapes answering the same
 * conceptual question, not the same computation in disguise.
 */
export type Stage = 'atHospital' | 'transitToLot' | 'parked' | 'transitToHospital';

export function selectVisitorStage(v: Visitor, hasActiveRetrievalDriver: (v: Visitor) => boolean): Stage {
  if (v.status === 'pending') {
    // Key not yet taken vs. already taken and driving to a slot.
    return v.pickedUpAt != null ? 'transitToLot' : 'atHospital';
  }
  // v.status === 'parked' from here on — delivered/retrieved/cancelled
  // visitors don't reach this (they're excluded from activeVisitors, or
  // land under Completed instead of Active).
  if (!v.retrievalRequested) return 'parked';
  return hasActiveRetrievalDriver(v) ? 'transitToHospital' : 'atHospital';
}

export function selectStaffStage(t: ParkingTask): Stage {
  if (t.type === 'park') {
    if (t.status === 'key_collected' || t.status === 'in_transit') return 'transitToLot';
    if (t.status === 'completed') return 'parked';
    return 'atHospital'; // assigned with no driver yet
  }
  // retrieve — a driver attached means it's accepted the job and is en
  // route either direction; with none it's still waiting to be staffed.
  return t.driverId != null ? 'transitToHospital' : 'atHospital';
}
