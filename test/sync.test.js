import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SYNC_CONFIG_KEY,
  SYNC_METADATA_KEY,
  SYNC_PREFERENCES_KEY,
  SYNC_PROFILE_KEY,
  createConfigEnvelope,
  createSyncEnvelope,
  createSyncManager,
  mergePreferencePayload,
  normalizeSyncConfig,
  preferencePayload,
  profilePayload,
  sanitizePreferencePayload,
  sanitizeProfilePayload,
  syncByteSize,
  validateConfigEnvelope,
  validateSyncEnvelope,
} from "../src/sync.js";
import { UN_LOCATIONS } from "../src/un-life-tables.js";

const managers = new Set();

const LOCAL_STATE = {
  version: 1,
  birth: "1990-06-15T09:30",
  birthZone: "Asia/Tokyo",
  theme: {
    bg: "#ffffff",
    label: "#6f747a",
    count: "#494949",
    accent: "#007ea6",
  },
  expectancy: 88,
  expectancySource: "custom",
  sex: "female",
  lifeTable: "un:392",
  mode: "weeks",
  typeface: "mono",
  reflection: true,
  language: "ja",
};

const REMOTE_STATE = {
  ...LOCAL_STATE,
  birth: "1980-01-02T03:04",
  birthZone: "Europe/London",
  theme: {
    bg: "#0a0a0a",
    label: "#8b9198",
    count: "#ededed",
    accent: "#5cc2ea",
  },
  expectancy: 93,
  expectancySource: "estimate",
  sex: "male",
  lifeTable: "world",
  mode: "days",
  typeface: "grotesk",
  reflection: false,
  language: "de",
};

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function keysFor(query, data) {
  if (typeof query === "string") return [query];
  if (Array.isArray(query)) return query;
  if (query && typeof query === "object") return Object.keys(query);
  return Object.keys(data);
}

function storageApi({ sync = {}, local = {}, autoEvents = false } = {}) {
  const syncData = clone(sync);
  const localData = clone(local);
  const listeners = new Set();
  const syncArea = {
    get: vi.fn(async (query) =>
      Object.fromEntries(
        keysFor(query, syncData)
          .filter((key) => Object.prototype.hasOwnProperty.call(syncData, key))
          .map((key) => [key, clone(syncData[key])]),
      ),
    ),
    set: vi.fn(async (items) => {
      const changes = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = {
          oldValue: clone(syncData[key]),
          newValue: clone(value),
        };
        syncData[key] = clone(value);
      }
      if (autoEvents) {
        for (const listener of listeners) listener(changes, "sync");
      }
    }),
    remove: vi.fn(async (query) => {
      const changes = {};
      for (const key of keysFor(query, syncData)) {
        if (!Object.prototype.hasOwnProperty.call(syncData, key)) continue;
        changes[key] = { oldValue: clone(syncData[key]) };
        delete syncData[key];
      }
      if (autoEvents) {
        for (const listener of listeners) listener(changes, "sync");
      }
    }),
  };
  const localArea = {
    get: vi.fn(async (query) =>
      Object.fromEntries(
        keysFor(query, localData)
          .filter((key) => Object.prototype.hasOwnProperty.call(localData, key))
          .map((key) => [key, clone(localData[key])]),
      ),
    ),
    set: vi.fn(async (items) => Object.assign(localData, clone(items))),
  };
  const onChanged = {
    addListener: vi.fn((listener) => listeners.add(listener)),
    removeListener: vi.fn((listener) => listeners.delete(listener)),
  };
  return {
    api: { storage: { sync: syncArea, local: localArea, onChanged } },
    syncArea,
    localArea,
    syncData,
    localData,
    emit(changes) {
      for (const listener of listeners) listener(changes, "sync");
    },
    listenerCount: () => listeners.size,
  };
}

async function settle() {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

function managerFor(storage, options = {}) {
  const persistLocal = vi.fn(async () => {});
  const onRemoteState = vi.fn(async () => {});
  const statuses = [];
  const manager = trackManager(
    createSyncManager({
      api: storage.api,
      persistLocal,
      onRemoteState,
      onStatus: (model) => statuses.push(model),
      ...options,
    }),
  );
  return { manager, persistLocal, onRemoteState, statuses };
}

function trackManager(manager) {
  managers.add(manager);
  return manager;
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  for (const manager of managers) manager.destroy();
  managers.clear();
  vi.useRealTimers();
});

describe("sync payload helpers", () => {
  it("extracts exactly the approved preference and profile scopes", () => {
    expect(preferencePayload(LOCAL_STATE)).toEqual({
      theme: LOCAL_STATE.theme,
      mode: "weeks",
      typeface: "mono",
      reflection: true,
      language: "ja",
    });
    expect(profilePayload(LOCAL_STATE)).toEqual({
      birth: "1990-06-15T09:30",
      birthZone: "Asia/Tokyo",
      sex: "female",
      expectancy: 88,
      expectancySource: "custom",
      lifeTable: "un:392",
    });
    expect(preferencePayload(LOCAL_STATE)).not.toHaveProperty("birth");
    expect(profilePayload(LOCAL_STATE)).not.toHaveProperty("theme");
  });

  it("normalizes profile=false whenever preference sync is false", () => {
    expect(normalizeSyncConfig({ preferences: false, profile: true })).toEqual({
      preferences: false,
      profile: false,
    });
  });

  it("strictly validates remote fields and rejects extras", () => {
    expect(sanitizePreferencePayload(preferencePayload(LOCAL_STATE))).toEqual(
      preferencePayload(LOCAL_STATE),
    );
    expect(sanitizeProfilePayload(profilePayload(LOCAL_STATE))).toEqual(
      profilePayload(LOCAL_STATE),
    );
    expect(() =>
      sanitizePreferencePayload({
        ...preferencePayload(LOCAL_STATE),
        birth: LOCAL_STATE.birth,
      }),
    ).toThrow(/unknown or missing/);
    expect(() =>
      sanitizeProfilePayload({
        ...profilePayload(LOCAL_STATE),
        birthZone: "not/a-zone",
      }),
    ).toThrow(/time zone/);
    expect(() =>
      sanitizeProfilePayload({
        ...profilePayload(LOCAL_STATE),
        lifeTable: "un:999",
      }),
    ).toThrow(/data source/);
  });

  it("accepts every stable generated UN life-table key without syncing arrays", () => {
    expect(UN_LOCATIONS).toHaveLength(237);
    for (const { id } of UN_LOCATIONS) {
      expect(
        sanitizeProfilePayload({
          ...profilePayload(LOCAL_STATE),
          lifeTable: id,
        }).lifeTable,
      ).toBe(id);
    }
    expect(profilePayload(LOCAL_STATE)).not.toHaveProperty("series");
  });

  it("validates schemas and rejects malformed or future envelopes", () => {
    const envelope = createSyncEnvelope(
      "preferences",
      preferencePayload(LOCAL_STATE),
      "writer-a",
      123,
    );
    expect(validateSyncEnvelope(envelope, "preferences")).toEqual(envelope);
    expect(() =>
      validateSyncEnvelope({ ...envelope, version: 2 }, "preferences"),
    ).toThrow(/newer/);
    expect(() =>
      validateSyncEnvelope({ ...envelope, unexpected: true }, "preferences"),
    ).toThrow(/malformed/);

    const config = createConfigEnvelope(
      { preferences: false, profile: true },
      "writer-a",
      123,
    );
    expect(validateConfigEnvelope(config)).toMatchObject({
      preferences: false,
      profile: false,
    });
    expect(() =>
      createConfigEnvelope({ preferences: true, profile: false }, null),
    ).toThrow(/writer ID/);
  });

  it("keeps each payload far below browser sync quotas", () => {
    const preferences = createSyncEnvelope(
      "preferences",
      preferencePayload(LOCAL_STATE),
      "writer-a",
    );
    const profile = createSyncEnvelope(
      "profile",
      profilePayload(LOCAL_STATE),
      "writer-a",
    );
    const config = createConfigEnvelope(
      { preferences: true, profile: true },
      "writer-a",
    );
    expect(syncByteSize(preferences)).toBeLessThan(1024);
    expect(syncByteSize(profile)).toBeLessThan(1024);
    expect(syncByteSize(config)).toBeLessThan(512);
    expect(
      syncByteSize(preferences) + syncByteSize(profile) + syncByteSize(config),
    ).toBeLessThan(2048);
  });
});

describe("sync manager opt-in and conflicts", () => {
  it("defaults existing users off with zero sync writes", async () => {
    const storage = storageApi();
    const { manager } = managerFor(storage);
    await expect(manager.initialize(LOCAL_STATE)).resolves.toEqual(LOCAL_STATE);
    expect(storage.syncArea.set).not.toHaveBeenCalled();
    expect(storage.syncArea.remove).not.toHaveBeenCalled();
    expect(storage.listenerCount()).toBe(1);
    expect(manager.model()).toMatchObject({
      available: true,
      preferences: false,
      profile: false,
      status: "off",
    });
    expect(storage.localData[SYNC_METADATA_KEY].writerId).toBeTruthy();
  });

  it("cleans stale payloads when configuration is missing without writing config", async () => {
    const storage = storageApi({
      sync: {
        [SYNC_PREFERENCES_KEY]: createSyncEnvelope(
          "preferences",
          preferencePayload(LOCAL_STATE),
          "remote",
        ),
        [SYNC_PROFILE_KEY]: createSyncEnvelope(
          "profile",
          profilePayload(LOCAL_STATE),
          "remote",
        ),
      },
    });
    const { manager } = managerFor(storage);
    await manager.initialize(LOCAL_STATE);
    expect(storage.syncArea.set).not.toHaveBeenCalled();
    expect(storage.syncArea.remove).toHaveBeenCalledWith([
      SYNC_PREFERENCES_KEY,
      SYNC_PROFILE_KEY,
    ]);
    expect(storage.syncData[SYNC_PREFERENCES_KEY]).toBeUndefined();
    expect(storage.syncData[SYNC_PROFILE_KEY]).toBeUndefined();
    expect(manager.model().status).toBe("off");
  });

  it("uploads local preferences when the first opt-in has no remote payload", async () => {
    const storage = storageApi();
    const { manager } = managerFor(storage);
    await manager.initialize(LOCAL_STATE);
    await manager.togglePreferences(true);

    expect(storage.syncData[SYNC_CONFIG_KEY]).toMatchObject({
      preferences: true,
      profile: false,
    });
    expect(storage.syncData[SYNC_PREFERENCES_KEY].data).toEqual(
      preferencePayload(LOCAL_STATE),
    );
    expect(storage.syncData[SYNC_PROFILE_KEY]).toBeUndefined();
  });

  it("uses an existing remote preference payload on first enable", async () => {
    const remote = createSyncEnvelope(
      "preferences",
      preferencePayload(REMOTE_STATE),
      "remote",
      1,
    );
    const storage = storageApi();
    const { manager, persistLocal, onRemoteState } = managerFor(storage);
    await manager.initialize(LOCAL_STATE);
    storage.syncData[SYNC_PREFERENCES_KEY] = clone(remote);
    await manager.togglePreferences(true);

    expect(persistLocal).toHaveBeenCalledWith(
      mergePreferencePayload(LOCAL_STATE, remote.data),
    );
    expect(onRemoteState).toHaveBeenCalledOnce();
    expect(storage.syncData[SYNC_PREFERENCES_KEY]).toEqual(remote);
  });

  it("keeps a local edit made while first-enable storage is still pending", async () => {
    const remote = createSyncEnvelope(
      "preferences",
      preferencePayload(REMOTE_STATE),
      "remote",
    );
    const storage = storageApi();
    const { manager, onRemoteState } = managerFor(storage);
    await manager.initialize(LOCAL_STATE);
    storage.syncData[SYNC_PREFERENCES_KEY] = clone(remote);
    const originalSet = storage.syncArea.set.getMockImplementation();
    let release;
    storage.syncArea.set.mockImplementationOnce(
      (items) =>
        new Promise((resolve) => {
          release = async () => {
            await originalSet(items);
            resolve();
          };
        }),
    );
    const enabling = manager.togglePreferences(true);
    await settle();
    manager.stateChanged({ ...LOCAL_STATE, mode: "daysLeft" });
    await release();
    await enabling;

    expect(onRemoteState).not.toHaveBeenCalled();
    expect(storage.syncData[SYNC_PREFERENCES_KEY].data.mode).toBe("daysLeft");
  });

  it("keeps a local edit made while first-enable remote reading is pending", async () => {
    const storage = storageApi();
    const { manager, onRemoteState } = managerFor(storage);
    await manager.initialize(LOCAL_STATE);
    storage.syncData[SYNC_PREFERENCES_KEY] = createSyncEnvelope(
      "preferences",
      preferencePayload(REMOTE_STATE),
      "remote",
    );
    const originalGet = storage.syncArea.get.getMockImplementation();
    let release;
    storage.syncArea.get.mockImplementationOnce(
      (query) =>
        new Promise((resolve) => {
          release = async () => resolve(await originalGet(query));
        }),
    );

    const enabling = manager.togglePreferences(true);
    await settle();
    manager.stateChanged({ ...LOCAL_STATE, mode: "yearsLeft" });
    await release();
    await enabling;

    expect(onRemoteState).not.toHaveBeenCalled();
    expect(storage.syncData[SYNC_PREFERENCES_KEY].data.mode).toBe("yearsLeft");
  });

  it("keeps profile absent until the second opt-in, then uploads or adopts it", async () => {
    const storage = storageApi();
    const { manager } = managerFor(storage);
    await manager.initialize(LOCAL_STATE);
    await manager.togglePreferences(true);
    expect(storage.syncData[SYNC_PROFILE_KEY]).toBeUndefined();
    await manager.toggleProfile(true);
    expect(storage.syncData[SYNC_PROFILE_KEY].data).toEqual(
      profilePayload(LOCAL_STATE),
    );

    await manager.toggleProfile(false);
    storage.syncData[SYNC_PROFILE_KEY] = createSyncEnvelope(
      "profile",
      profilePayload(REMOTE_STATE),
      "remote",
    );
    await manager.toggleProfile(true);
    expect(manager.model().profile).toBe(true);
    expect(storage.syncData[SYNC_PROFILE_KEY].data).toEqual(
      profilePayload(REMOTE_STATE),
    );
  });

  it("removes only the disabled remote scopes and never changes local state", async () => {
    const storage = storageApi();
    const { manager, persistLocal } = managerFor(storage);
    await manager.initialize(LOCAL_STATE);
    await manager.togglePreferences(true);
    await manager.toggleProfile(true);
    persistLocal.mockClear();

    await manager.toggleProfile(false);
    expect(storage.syncData[SYNC_PREFERENCES_KEY]).toBeDefined();
    expect(storage.syncData[SYNC_PROFILE_KEY]).toBeUndefined();
    expect(persistLocal).not.toHaveBeenCalled();

    await manager.togglePreferences(false);
    expect(storage.syncData[SYNC_PREFERENCES_KEY]).toBeUndefined();
    expect(storage.syncData[SYNC_PROFILE_KEY]).toBeUndefined();
    expect(persistLocal).not.toHaveBeenCalled();
    expect(manager.model()).toMatchObject({
      preferences: false,
      profile: false,
      status: "off",
    });
  });

  it("flushes a preference edit made while profile opt-out is pending", async () => {
    const storage = storageApi({
      sync: {
        [SYNC_CONFIG_KEY]: createConfigEnvelope(
          { preferences: true, profile: true },
          "remote",
        ),
        [SYNC_PREFERENCES_KEY]: createSyncEnvelope(
          "preferences",
          preferencePayload(LOCAL_STATE),
          "remote",
        ),
        [SYNC_PROFILE_KEY]: createSyncEnvelope(
          "profile",
          profilePayload(LOCAL_STATE),
          "remote",
        ),
      },
    });
    const { manager } = managerFor(storage);
    await manager.initialize(LOCAL_STATE);
    const originalSet = storage.syncArea.set.getMockImplementation();
    let release;
    storage.syncArea.set.mockImplementationOnce(
      (items) =>
        new Promise((resolve) => {
          release = async () => {
            await originalSet(items);
            resolve();
          };
        }),
    );

    const disabling = manager.toggleProfile(false);
    await settle();
    manager.stateChanged({ ...LOCAL_STATE, language: "fr" });
    await release();
    await disabling;

    expect(storage.syncData[SYNC_PROFILE_KEY]).toBeUndefined();
    expect(storage.syncData[SYNC_PREFERENCES_KEY].data.language).toBe("fr");
    expect(manager.model().status).toBe("synced");
  });

  it("applies enabled remote payloads before initialize resolves", async () => {
    const storage = storageApi({
      sync: {
        [SYNC_CONFIG_KEY]: createConfigEnvelope(
          { preferences: true, profile: true },
          "remote",
        ),
        [SYNC_PREFERENCES_KEY]: createSyncEnvelope(
          "preferences",
          preferencePayload(REMOTE_STATE),
          "remote",
        ),
        [SYNC_PROFILE_KEY]: createSyncEnvelope(
          "profile",
          profilePayload(REMOTE_STATE),
          "remote",
        ),
      },
    });
    const { manager, persistLocal, onRemoteState } = managerFor(storage);
    const result = await manager.initialize(LOCAL_STATE);
    expect(result).toEqual(REMOTE_STATE);
    expect(persistLocal).toHaveBeenCalledWith(REMOTE_STATE);
    expect(onRemoteState).not.toHaveBeenCalled();
  });
});

describe("sync manager events, coalescing, and failures", () => {
  it("applies a foreign delivered value once, ignores own echoes, and never republishes", async () => {
    const storage = storageApi({ autoEvents: true });
    const { manager, persistLocal, onRemoteState } = managerFor(storage);
    await manager.initialize(LOCAL_STATE);
    await manager.togglePreferences(true);
    await settle();
    persistLocal.mockClear();
    onRemoteState.mockClear();
    storage.syncArea.set.mockClear();

    const foreign = createSyncEnvelope(
      "preferences",
      preferencePayload(REMOTE_STATE),
      "remote",
      50,
    );
    storage.syncData[SYNC_PREFERENCES_KEY] = clone(foreign);
    storage.emit({
      [SYNC_PREFERENCES_KEY]: {
        oldValue: createSyncEnvelope(
          "preferences",
          preferencePayload(LOCAL_STATE),
          storage.localData[SYNC_METADATA_KEY].writerId,
        ),
        newValue: foreign,
      },
    });
    expect(manager.model()).toMatchObject({ status: "syncing", busy: true });
    await settle();

    expect(persistLocal).toHaveBeenCalledOnce();
    expect(onRemoteState).toHaveBeenCalledOnce();
    expect(storage.syncArea.set).not.toHaveBeenCalled();
  });

  it("propagates updates between live tabs that share one stable device writer ID", async () => {
    const storage = storageApi({ autoEvents: true });
    const first = managerFor(storage);
    const second = managerFor(storage);
    await first.manager.initialize(LOCAL_STATE);
    await second.manager.initialize(LOCAL_STATE);
    await first.manager.togglePreferences(true);
    await settle();

    expect(first.manager.model().preferences).toBe(true);
    expect(second.manager.model().preferences).toBe(true);

    first.onRemoteState.mockClear();
    second.manager.stateChanged({ ...LOCAL_STATE, mode: "daysLeft" });
    await second.manager.flush();
    await settle();
    expect(first.onRemoteState).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "daysLeft" }),
    );
  });

  it("ignores its own profile-removal event without reconciling it again", async () => {
    const storage = storageApi({
      autoEvents: true,
      sync: {
        [SYNC_CONFIG_KEY]: createConfigEnvelope(
          { preferences: true, profile: true },
          "remote",
        ),
        [SYNC_PREFERENCES_KEY]: createSyncEnvelope(
          "preferences",
          preferencePayload(LOCAL_STATE),
          "remote",
        ),
        [SYNC_PROFILE_KEY]: createSyncEnvelope(
          "profile",
          profilePayload(LOCAL_STATE),
          "remote",
        ),
      },
    });
    const { manager } = managerFor(storage);
    await manager.initialize(LOCAL_STATE);
    storage.syncArea.get.mockClear();

    await manager.toggleProfile(false);
    await settle();

    expect(storage.syncArea.get).toHaveBeenCalledOnce();
    expect(storage.syncArea.get).toHaveBeenCalledWith([SYNC_PROFILE_KEY]);
    expect(manager.model()).toMatchObject({
      preferences: true,
      profile: false,
      status: "synced",
      busy: false,
    });
  });

  it("keeps the actual last write authoritative when live-tab writes finish out of order", async () => {
    const storage = storageApi({
      sync: {
        [SYNC_CONFIG_KEY]: createConfigEnvelope(
          { preferences: true, profile: false },
          "remote",
        ),
        [SYNC_PREFERENCES_KEY]: createSyncEnvelope(
          "preferences",
          preferencePayload(LOCAL_STATE),
          "remote",
        ),
      },
    });
    const first = managerFor(storage);
    const second = managerFor(storage);
    await first.manager.initialize(LOCAL_STATE);
    await second.manager.initialize(LOCAL_STATE);
    const pending = [];
    storage.syncArea.set.mockImplementation(
      (items) =>
        new Promise((resolve) => {
          pending.push({ items: clone(items), resolve });
        }),
    );
    const release = (entry) => {
      const changes = {};
      for (const [key, value] of Object.entries(entry.items)) {
        changes[key] = {
          oldValue: clone(storage.syncData[key]),
          newValue: clone(value),
        };
        storage.syncData[key] = clone(value);
      }
      storage.emit(changes);
      entry.resolve();
    };

    first.manager.stateChanged({ ...LOCAL_STATE, mode: "days" });
    second.manager.stateChanged({ ...LOCAL_STATE, mode: "weeksLeft" });
    const firstFlush = first.manager.flush();
    const secondFlush = second.manager.flush();
    await settle();
    expect(pending).toHaveLength(2);

    release(pending[1]);
    await settle();
    release(pending[0]);
    await Promise.all([firstFlush, secondFlush]);
    await settle();

    expect(storage.syncData[SYNC_PREFERENCES_KEY].data.mode).toBe("days");
    expect(first.onRemoteState).not.toHaveBeenCalled();
    expect(second.onRemoteState).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "days" }),
    );
  });

  it("does not let a concurrent profile write hide another tab's profile opt-out", async () => {
    const storage = storageApi({
      autoEvents: true,
      sync: {
        [SYNC_CONFIG_KEY]: createConfigEnvelope(
          { preferences: true, profile: true },
          "remote",
        ),
        [SYNC_PREFERENCES_KEY]: createSyncEnvelope(
          "preferences",
          preferencePayload(LOCAL_STATE),
          "remote",
        ),
        [SYNC_PROFILE_KEY]: createSyncEnvelope(
          "profile",
          profilePayload(LOCAL_STATE),
          "remote",
        ),
      },
    });
    const first = managerFor(storage);
    const second = managerFor(storage);
    await first.manager.initialize(LOCAL_STATE);
    await second.manager.initialize(LOCAL_STATE);
    const pending = [];
    storage.syncArea.set.mockImplementation(
      (items) =>
        new Promise((resolve) => {
          pending.push({ items: clone(items), resolve });
        }),
    );
    const release = (entry) => {
      const changes = {};
      for (const [key, value] of Object.entries(entry.items)) {
        changes[key] = {
          oldValue: clone(storage.syncData[key]),
          newValue: clone(value),
        };
        storage.syncData[key] = clone(value);
      }
      storage.emit(changes);
      entry.resolve();
    };

    first.manager.stateChanged({ ...LOCAL_STATE, expectancy: 99 });
    const profileWrite = first.manager.flush();
    const profileOptOut = second.manager.toggleProfile(false);
    await settle();
    expect(pending).toHaveLength(2);

    release(pending[1]);
    await profileOptOut;
    await settle();
    release(pending[0]);
    await profileWrite;
    await settle();

    expect(storage.syncData[SYNC_CONFIG_KEY].profile).toBe(false);
    expect(storage.syncData[SYNC_PROFILE_KEY]).toBeUndefined();
    expect(first.manager.model().profile).toBe(false);
    expect(second.manager.model().profile).toBe(false);
  });

  it("drops an older pending local write when a foreign value becomes authoritative", async () => {
    vi.useFakeTimers();
    const initialEnvelope = createSyncEnvelope(
      "preferences",
      preferencePayload(LOCAL_STATE),
      "remote",
    );
    const storage = storageApi({
      sync: {
        [SYNC_CONFIG_KEY]: createConfigEnvelope(
          { preferences: true, profile: false },
          "remote",
        ),
        [SYNC_PREFERENCES_KEY]: initialEnvelope,
      },
    });
    const { manager } = managerFor(storage, { debounceMs: 750 });
    await manager.initialize(LOCAL_STATE);
    storage.syncArea.set.mockClear();

    manager.stateChanged({ ...LOCAL_STATE, mode: "weeksLeft" });
    const foreign = createSyncEnvelope(
      "preferences",
      preferencePayload({ ...REMOTE_STATE, mode: "days" }),
      "other-device",
    );
    storage.syncData[SYNC_PREFERENCES_KEY] = clone(foreign);
    storage.emit({
      [SYNC_PREFERENCES_KEY]: {
        oldValue: initialEnvelope,
        newValue: foreign,
      },
    });
    await settle();
    await vi.advanceTimersByTimeAsync(750);
    await settle();

    expect(storage.syncData[SYNC_PREFERENCES_KEY]).toEqual(foreign);
    expect(storage.syncArea.set).not.toHaveBeenCalled();
  });

  it("keeps a newer local edit when an older remote apply finishes late", async () => {
    vi.useFakeTimers();
    const initial = createSyncEnvelope(
      "preferences",
      preferencePayload(LOCAL_STATE),
      "remote",
    );
    const storage = storageApi({
      sync: {
        [SYNC_CONFIG_KEY]: createConfigEnvelope(
          { preferences: true, profile: false },
          "remote",
        ),
        [SYNC_PREFERENCES_KEY]: initial,
      },
    });
    let release;
    const persistLocal = vi.fn(
      () => new Promise((resolve) => (release = resolve)),
    );
    const onRemoteState = vi.fn(async () => {});
    const manager = trackManager(
      createSyncManager({
        api: storage.api,
        persistLocal,
        onRemoteState,
        debounceMs: 750,
      }),
    );
    await manager.initialize(LOCAL_STATE);
    storage.syncArea.set.mockClear();

    const olderRemote = createSyncEnvelope(
      "preferences",
      preferencePayload({ ...REMOTE_STATE, mode: "days" }),
      "other-device",
    );
    storage.syncData[SYNC_PREFERENCES_KEY] = clone(olderRemote);
    storage.emit({
      [SYNC_PREFERENCES_KEY]: {
        oldValue: initial,
        newValue: olderRemote,
      },
    });
    await settle();
    expect(persistLocal).toHaveBeenCalledOnce();

    const newerLocal = { ...LOCAL_STATE, mode: "weeksLeft" };
    manager.stateChanged(newerLocal);
    release();
    await settle();
    expect(onRemoteState).not.toHaveBeenCalled();

    await manager.flush();
    expect(manager.model().preferences).toBe(true);
    expect(storage.syncArea.set).toHaveBeenCalled();
    expect(storage.syncData[SYNC_PREFERENCES_KEY].data.mode).toBe("weeksLeft");
  });

  it("handles payload-before-config event ordering by refetching config", async () => {
    const storage = storageApi();
    const { manager, persistLocal } = managerFor(storage);
    await manager.initialize(LOCAL_STATE);
    const config = createConfigEnvelope(
      { preferences: true, profile: false },
      "remote",
    );
    const preferences = createSyncEnvelope(
      "preferences",
      preferencePayload(REMOTE_STATE),
      "remote",
    );
    storage.syncData[SYNC_CONFIG_KEY] = clone(config);
    storage.syncData[SYNC_PREFERENCES_KEY] = clone(preferences);
    storage.emit({
      [SYNC_PREFERENCES_KEY]: { newValue: preferences },
    });
    await settle();

    expect(persistLocal).toHaveBeenCalledWith(
      mergePreferencePayload(LOCAL_STATE, preferences.data),
    );
    expect(manager.model().preferences).toBe(true);
  });

  it("buffers an update delivered while initialization is applying its first snapshot", async () => {
    const first = createSyncEnvelope(
      "preferences",
      preferencePayload({ ...REMOTE_STATE, mode: "days" }),
      "remote",
    );
    const latest = createSyncEnvelope(
      "preferences",
      preferencePayload({ ...REMOTE_STATE, mode: "weeks" }),
      "other-device",
    );
    const storage = storageApi({
      sync: {
        [SYNC_CONFIG_KEY]: createConfigEnvelope(
          { preferences: true, profile: false },
          "remote",
        ),
        [SYNC_PREFERENCES_KEY]: first,
      },
    });
    let release;
    const persistLocal = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((resolve) => (release = resolve)),
      )
      .mockResolvedValue(undefined);
    const manager = trackManager(
      createSyncManager({
        api: storage.api,
        persistLocal,
      }),
    );

    const initializing = manager.initialize(LOCAL_STATE);
    await settle();
    expect(persistLocal).toHaveBeenCalledOnce();
    storage.syncData[SYNC_PREFERENCES_KEY] = clone(latest);
    storage.emit({
      [SYNC_PREFERENCES_KEY]: { oldValue: first, newValue: latest },
    });
    release();

    await expect(initializing).resolves.toMatchObject({ mode: "weeks" });
    expect(persistLocal).toHaveBeenCalledTimes(2);
    expect(persistLocal).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: "weeks" }),
    );
  });

  it("self-heals stale remote payloads left behind under an off configuration", async () => {
    const storage = storageApi({
      sync: {
        [SYNC_CONFIG_KEY]: createConfigEnvelope(
          { preferences: false, profile: false },
          "remote",
        ),
        [SYNC_PREFERENCES_KEY]: createSyncEnvelope(
          "preferences",
          preferencePayload(LOCAL_STATE),
          "remote",
        ),
        [SYNC_PROFILE_KEY]: createSyncEnvelope(
          "profile",
          profilePayload(LOCAL_STATE),
          "remote",
        ),
      },
    });
    const { manager } = managerFor(storage);
    await manager.initialize(LOCAL_STATE);

    expect(storage.syncData[SYNC_PREFERENCES_KEY]).toBeUndefined();
    expect(storage.syncData[SYNC_PROFILE_KEY]).toBeUndefined();
    expect(manager.model().status).toBe("off");
  });

  it("removes a newly delivered payload when configuration remains absent", async () => {
    const storage = storageApi({ autoEvents: true });
    const { manager } = managerFor(storage);
    await manager.initialize(LOCAL_STATE);
    storage.syncArea.get.mockClear();
    const profile = createSyncEnvelope(
      "profile",
      profilePayload(REMOTE_STATE),
      "other-device",
    );
    storage.syncData[SYNC_PROFILE_KEY] = clone(profile);
    storage.emit({ [SYNC_PROFILE_KEY]: { newValue: profile } });
    await settle();

    expect(storage.syncData[SYNC_PROFILE_KEY]).toBeUndefined();
    expect(storage.syncArea.get).toHaveBeenCalledTimes(3);
    expect(manager.model().status).toBe("off");
  });

  it("removes a stale personal payload whenever profile sync is off", async () => {
    const storage = storageApi({
      sync: {
        [SYNC_CONFIG_KEY]: createConfigEnvelope(
          { preferences: true, profile: false },
          "remote",
        ),
        [SYNC_PREFERENCES_KEY]: createSyncEnvelope(
          "preferences",
          preferencePayload(LOCAL_STATE),
          "remote",
        ),
        [SYNC_PROFILE_KEY]: createSyncEnvelope(
          "profile",
          profilePayload(LOCAL_STATE),
          "remote",
        ),
      },
    });
    const { manager } = managerFor(storage);
    await manager.initialize(LOCAL_STATE);
    expect(storage.syncData[SYNC_PROFILE_KEY]).toBeUndefined();
    expect(storage.syncData[SYNC_PREFERENCES_KEY]).toBeDefined();
  });

  it("surfaces malformed and future envelopes as errors", async () => {
    const storage = storageApi({
      sync: {
        [SYNC_CONFIG_KEY]: {
          ...createConfigEnvelope(
            { preferences: true, profile: false },
            "remote",
          ),
          version: 2,
        },
      },
    });
    const { manager } = managerFor(storage);
    await manager.initialize(LOCAL_STATE);
    expect(manager.model()).toMatchObject({
      status: "error",
      preferences: false,
    });
    expect(manager.model().error).toMatch(/newer/);
  });

  it("keeps the latest local state and retries a rejected sync write", async () => {
    const storage = storageApi();
    const { manager } = managerFor(storage);
    await manager.initialize(LOCAL_STATE);
    storage.syncArea.set.mockRejectedValueOnce(new Error("QUOTA_BYTES quota"));
    await manager.togglePreferences(true);
    expect(manager.model().status).toBe("error");
    expect(manager.model().preferences).toBe(false);

    await manager.retry();
    expect(manager.model()).toMatchObject({
      status: "synced",
      preferences: true,
    });
    expect(storage.syncData[SYNC_PREFERENCES_KEY].data).toEqual(
      preferencePayload(LOCAL_STATE),
    );
  });

  it("retries incomplete local persistence before reporting a remote apply as synced", async () => {
    const storage = storageApi({
      sync: {
        [SYNC_CONFIG_KEY]: createConfigEnvelope(
          { preferences: true, profile: false },
          "remote",
        ),
        [SYNC_PREFERENCES_KEY]: createSyncEnvelope(
          "preferences",
          preferencePayload(REMOTE_STATE),
          "remote",
        ),
      },
    });
    const persistLocal = vi
      .fn()
      .mockRejectedValueOnce(new Error("local write failed"))
      .mockResolvedValue(undefined);
    const onRemoteState = vi.fn(async () => {});
    const manager = trackManager(
      createSyncManager({
        api: storage.api,
        persistLocal,
        onRemoteState,
      }),
    );
    await manager.initialize(LOCAL_STATE);
    expect(manager.model().status).toBe("error");

    await manager.retry();
    expect(persistLocal).toHaveBeenCalledTimes(2);
    expect(onRemoteState).toHaveBeenCalledOnce();
    expect(manager.model().status).toBe("synced");
  });

  it("reinitializes a stable writer id after transient metadata failure", async () => {
    const storage = storageApi();
    storage.localArea.get.mockRejectedValueOnce(
      new Error("metadata unavailable"),
    );
    const { manager } = managerFor(storage);
    await manager.initialize(LOCAL_STATE);
    expect(manager.model().status).toBe("error");
    await manager.togglePreferences(true);
    expect(storage.syncArea.set).not.toHaveBeenCalled();

    await manager.retry();
    await manager.togglePreferences(true);
    expect(storage.syncData[SYNC_CONFIG_KEY].writerId).toEqual(
      expect.any(String),
    );
    expect(storage.syncData[SYNC_CONFIG_KEY].writerId).not.toBe("");
    expect(storage.syncData[SYNC_PREFERENCES_KEY].writerId).toBe(
      storage.syncData[SYNC_CONFIG_KEY].writerId,
    );
  });

  it("preserves a failed profile-removal retry across unrelated successful writes", async () => {
    vi.useFakeTimers();
    const storage = storageApi({
      sync: {
        [SYNC_CONFIG_KEY]: createConfigEnvelope(
          { preferences: true, profile: true },
          "remote",
        ),
        [SYNC_PREFERENCES_KEY]: createSyncEnvelope(
          "preferences",
          preferencePayload(LOCAL_STATE),
          "remote",
        ),
        [SYNC_PROFILE_KEY]: createSyncEnvelope(
          "profile",
          profilePayload(LOCAL_STATE),
          "remote",
        ),
      },
    });
    const { manager } = managerFor(storage, { debounceMs: 500 });
    await manager.initialize(LOCAL_STATE);
    storage.syncArea.remove.mockRejectedValueOnce(new Error("remove failed"));
    await manager.toggleProfile(false);
    expect(manager.model().status).toBe("error");
    expect(storage.syncData[SYNC_PROFILE_KEY]).toBeDefined();

    manager.stateChanged({ ...LOCAL_STATE, language: "fr" });
    await vi.advanceTimersByTimeAsync(500);
    await settle();
    expect(manager.model().status).toBe("error");
    expect(manager.model().error).toMatch(/remove failed/);
    expect(storage.syncData[SYNC_PROFILE_KEY]).toBeDefined();

    await manager.retry();
    expect(manager.model().status).toBe("synced");
    expect(storage.syncData[SYNC_PROFILE_KEY]).toBeUndefined();
  });

  it("surfaces get and remove failures and allows retry", async () => {
    const getStorage = storageApi();
    getStorage.syncArea.get.mockRejectedValueOnce(new Error("unavailable"));
    const getManager = managerFor(getStorage).manager;
    await getManager.initialize(LOCAL_STATE);
    expect(getManager.model().status).toBe("error");
    await getManager.retry();
    expect(getManager.model().status).toBe("off");

    const removeStorage = storageApi();
    const removeManager = managerFor(removeStorage).manager;
    await removeManager.initialize(LOCAL_STATE);
    await removeManager.togglePreferences(true);
    removeStorage.syncArea.remove.mockRejectedValueOnce(
      new Error("remove failed"),
    );
    await removeManager.togglePreferences(false);
    expect(removeManager.model().status).toBe("error");
    await removeManager.retry();
    expect(removeManager.model().status).toBe("off");
  });

  it("coalesces 50 rapid preference changes into one latest write", async () => {
    vi.useFakeTimers();
    const storage = storageApi();
    const { manager } = managerFor(storage, { debounceMs: 750 });
    await manager.initialize(LOCAL_STATE);
    await manager.togglePreferences(true);
    storage.syncArea.set.mockClear();

    let latest;
    for (let index = 0; index < 50; index += 1) {
      latest = {
        ...LOCAL_STATE,
        theme: {
          ...LOCAL_STATE.theme,
          accent: `#${index.toString(16).padStart(6, "0")}`,
        },
      };
      manager.stateChanged(latest);
    }
    await vi.advanceTimersByTimeAsync(750);
    await settle();

    expect(storage.syncArea.set).toHaveBeenCalledOnce();
    expect(
      storage.syncArea.set.mock.calls[0][0][SYNC_PREFERENCES_KEY].data,
    ).toEqual(preferencePayload(latest));
  });

  it("serializes simultaneous preference and profile changes at latest values", async () => {
    vi.useFakeTimers();
    const storage = storageApi();
    const { manager } = managerFor(storage, { debounceMs: 500 });
    await manager.initialize(LOCAL_STATE);
    await manager.togglePreferences(true);
    await manager.toggleProfile(true);
    storage.syncArea.set.mockClear();

    const first = { ...LOCAL_STATE, language: "de", expectancy: 90 };
    const latest = { ...first, language: "fr", expectancy: 91 };
    manager.stateChanged(first);
    manager.stateChanged(latest);
    await vi.advanceTimersByTimeAsync(500);
    await settle();

    expect(storage.syncArea.set).toHaveBeenCalledOnce();
    const written = storage.syncArea.set.mock.calls[0][0];
    expect(written[SYNC_PREFERENCES_KEY].data.language).toBe("fr");
    expect(written[SYNC_PROFILE_KEY].data.expectancy).toBe(91);
  });

  it("reports unavailable without touching local behavior", async () => {
    const persistLocal = vi.fn();
    const manager = trackManager(
      createSyncManager({
        api: undefined,
        persistLocal,
      }),
    );
    await expect(manager.initialize(LOCAL_STATE)).resolves.toBe(LOCAL_STATE);
    manager.stateChanged({ ...LOCAL_STATE, language: "de" });
    expect(manager.model()).toMatchObject({
      available: false,
      status: "unavailable",
    });
    expect(persistLocal).not.toHaveBeenCalled();
  });
});
