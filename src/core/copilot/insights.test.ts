import {selectInsights, InsightContext} from './insights';

/**
 * What the co-pilot is allowed to say, and — more importantly — when it must
 * stay quiet.
 *
 * The "empty-collection trap" block is the reason this file exists. Each
 * role's app fetches a different set of collections (AppStateContext's
 * needsOpsData / needsVisitors gates), so a staffing rule reading `drivers`
 * on a doctor's phone sees an empty array and concludes, with total
 * confidence, that no driver is free. An empty list because nobody fetched
 * it looks identical to an empty list because the world is empty, and only
 * one of those is worth alarming someone about. These lock that shut.
 */

const NOW = 1_700_000_000_000;
const MIN = 60_000;

const base = (o: Partial<InsightContext>): InsightContext => ({
  role: 'valet',
  tasks: [],
  visitors: [],
  drivers: [],
  connected: true,
  hydrated: true,
  now: NOW,
  ...o,
} as InsightContext);

const task = (o: Record<string, unknown>) => ({
  id: 1, type: 'retrieve', status: 'requested', doctorId: 9, carNumber: 'TS09AB1234', ...o,
} as any);

const driver = (status: string, id = 1) => ({id, name: `D${id}`, status} as any);

const kinds = (c: InsightContext) => selectInsights(c).map(i => i.kind);

describe('silence when it cannot know', () => {
  it('says nothing before the first fetch lands', () => {
    expect(kinds(base({hydrated: false, tasks: [task({requestedAt: NOW - 30 * MIN})]}))).toEqual([]);
  });

  it('reports only the disconnection, never conclusions drawn from stale lists', () => {
    expect(kinds(base({connected: false, tasks: [task({requestedAt: NOW - 30 * MIN})]}))).toEqual(['offline']);
  });
});

describe('the empty-collection trap', () => {
  it('never claims a staffing problem to a doctor, who has no drivers roster', () => {
    expect(kinds(base({
      role: 'doctor', userId: 9, drivers: [],
      tasks: [task({requestedAt: NOW - 30 * MIN, plannedDepartureMinutes: 5})],
    }))).toEqual(['retrieval_stalled']);
  });

  it('never claims a staffing problem to a driver, who has no drivers roster', () => {
    expect(kinds(base({
      role: 'driver', driverId: 3,
      tasks: [task({driverId: 3, status: 'in_transit', startedAt: NOW - 10 * MIN, locationUpdatedAt: NOW})],
    }))).toEqual([]);
  });
});

describe('valet / admin', () => {
  it('flags a retrieval nobody has picked up', () => {
    expect(kinds(base({tasks: [task({requestedAt: NOW - 6 * MIN})]}))).toEqual(['unstaffed_retrieval']);
  });

  it('stays quiet below the threshold', () => {
    expect(kinds(base({tasks: [task({requestedAt: NOW - 2 * MIN})]}))).toEqual([]);
  });

  it('flags a crunch when nobody is free', () => {
    expect(kinds(base({
      drivers: [],
      tasks: [
        task({id: 1, requestedAt: NOW, plannedDepartureMinutes: 5, driverId: 7, status: 'assigned', acceptedAt: NOW}),
        task({id: 2, requestedAt: NOW, plannedDepartureMinutes: 5, driverId: 8, status: 'assigned', acceptedAt: NOW}),
      ],
    }))).toEqual(['retrieval_crunch']);
  });

  it('does not cry crunch when there are enough free drivers', () => {
    expect(kinds(base({
      drivers: [driver('available', 1), driver('available', 2)],
      tasks: [
        task({id: 1, requestedAt: NOW, plannedDepartureMinutes: 5, driverId: 7, status: 'assigned', acceptedAt: NOW}),
        task({id: 2, requestedAt: NOW, plannedDepartureMinutes: 5, driverId: 8, status: 'assigned', acceptedAt: NOW}),
      ],
    }))).toEqual([]);
  });

  it('does not count a busy driver as cover for a departure', () => {
    expect(kinds(base({
      drivers: [driver('busy')],
      tasks: [task({id: 1, requestedAt: NOW, plannedDepartureMinutes: 5, driverId: 7, status: 'assigned', acceptedAt: NOW})],
    }))).toEqual(['retrieval_crunch']);
  });
});

describe('driver', () => {
  it('warns about their own unaccepted job before the watchdog takes it', () => {
    expect(kinds(base({
      role: 'driver', driverId: 3,
      tasks: [task({driverId: 3, status: 'assigned', assignedAt: NOW - 2 * MIN})],
    }))).toEqual(['job_unaccepted']);
  });

  it('warns when their position is not reaching the desk mid-job', () => {
    expect(kinds(base({
      role: 'driver', driverId: 3,
      tasks: [task({driverId: 3, status: 'in_transit', startedAt: NOW - 5 * MIN})],
    }))).toEqual(['location_off']);
  });
});

describe('doctor / staff', () => {
  it('tells them the car is waiting', () => {
    expect(kinds(base({role: 'doctor', userId: 9, tasks: [task({status: 'delivered'})]}))).toEqual(['car_ready']);
  });
});

describe('ranking', () => {
  it('puts the critical item above the informational one', () => {
    expect(kinds(base({
      tasks: [task({requestedAt: NOW - 6 * MIN})],
      visitors: [{id: 1, status: 'parked', retrievalRequested: false, pickedUpAt: NOW - 5 * 60 * MIN, carNumber: 'X'} as any],
    }))).toEqual(['unstaffed_retrieval', 'stale_parked']);
  });
});
