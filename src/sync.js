// Opt-in browser-account sync. Local storage remains the source of persistence;
// this module only mirrors the explicitly enabled scopes through storage.sync.

import { MODES, THEME_KEYS, TYPEFACES, clampExpectancy } from "./store.js";
import { normalizeLanguage } from "./i18n.js";
import { normalizeLifeTable } from "./lifetable.js";
import { isValidZone, parseBirthParts } from "./time.js";

export const SYNC_VERSION = 1;
export const SYNC_CONFIG_KEY = "mortality.sync.config";
export const SYNC_PREFERENCES_KEY = "mortality.sync.preferences";
export const SYNC_PROFILE_KEY = "mortality.sync.profile";
export const SYNC_METADATA_KEY = "mortality.sync.metadata";

const CONFIG_SCHEMA = "mortality.sync.config";
const PREFERENCE_SCHEMA = "mortality.sync.preferences";
const PROFILE_SCHEMA = "mortality.sync.profile";
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const PREFERENCE_KEYS = ["theme", "mode", "typeface", "reflection", "language"];
const PROFILE_KEYS = [
  "birth",
  "birthZone",
  "sex",
  "expectancy",
  "expectancySource",
  "lifeTable",
];

export class SyncValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "SyncValidationError";
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index])
  );
}

function validation(message) {
  throw new SyncValidationError(message);
}

function validTheme(value) {
  if (value === null) return null;
  if (!hasExactKeys(value, THEME_KEYS)) {
    validation("Synced theme has unknown or missing fields");
  }
  const theme = {};
  for (const key of THEME_KEYS) {
    if (typeof value[key] !== "string" || !HEX_COLOR.test(value[key])) {
      validation(`Synced theme field "${key}" is not a valid hex color`);
    }
    theme[key] = value[key].toLowerCase();
  }
  return theme;
}

function localTheme(value) {
  try {
    return validTheme(value);
  } catch {
    return null;
  }
}

/** Extract the five non-personal values eligible for preference sync. */
export function preferencePayload(state) {
  return {
    theme: localTheme(state?.theme ?? null),
    mode: MODES.includes(state?.mode) ? state.mode : "years",
    typeface: TYPEFACES.includes(state?.typeface) ? state.typeface : "system",
    reflection: Boolean(state?.reflection),
    language: normalizeLanguage(state?.language),
  };
}

/** Extract only the explicitly personal values eligible for profile sync. */
export function profilePayload(state) {
  return {
    birth:
      typeof state?.birth === "string" && parseBirthParts(state.birth)
        ? state.birth
        : null,
    birthZone: isValidZone(state?.birthZone) ? state.birthZone : null,
    sex: state?.sex === "male" || state?.sex === "female" ? state.sex : null,
    expectancy: clampExpectancy(state?.expectancy),
    expectancySource:
      state?.expectancySource === "custom" ? "custom" : "estimate",
    lifeTable: normalizeLifeTable(state?.lifeTable),
  };
}

/** Validate and canonicalize a remote preference payload without extra fields. */
export function sanitizePreferencePayload(value) {
  if (!hasExactKeys(value, PREFERENCE_KEYS)) {
    validation("Synced preferences have unknown or missing fields");
  }
  if (!MODES.includes(value.mode)) validation("Synced counter mode is invalid");
  if (!TYPEFACES.includes(value.typeface)) {
    validation("Synced numeral style is invalid");
  }
  if (typeof value.reflection !== "boolean") {
    validation("Synced reflection setting is invalid");
  }
  if (typeof value.language !== "string") {
    validation("Synced language is invalid");
  }
  const language = normalizeLanguage(value.language);
  if (value.language !== "auto" && language === "auto") {
    validation("Synced language is unsupported");
  }
  return {
    theme: validTheme(value.theme),
    mode: value.mode,
    typeface: value.typeface,
    reflection: value.reflection,
    language,
  };
}

/** Validate and canonicalize a remote personal-profile payload. */
export function sanitizeProfilePayload(value) {
  if (!hasExactKeys(value, PROFILE_KEYS)) {
    validation("Synced profile has unknown or missing fields");
  }
  if (
    value.birth !== null &&
    (typeof value.birth !== "string" || !parseBirthParts(value.birth))
  ) {
    validation("Synced birth date is invalid");
  }
  if (
    value.birthZone !== null &&
    (typeof value.birthZone !== "string" || !isValidZone(value.birthZone))
  ) {
    validation("Synced birth time zone is invalid");
  }
  if (value.sex !== null && value.sex !== "male" && value.sex !== "female") {
    validation("Synced sex value is invalid");
  }
  if (
    typeof value.expectancy !== "number" ||
    !Number.isFinite(value.expectancy)
  ) {
    validation("Synced life expectancy is invalid");
  }
  if (
    value.expectancySource !== "estimate" &&
    value.expectancySource !== "custom"
  ) {
    validation("Synced life-expectancy source is invalid");
  }
  const lifeTable = normalizeLifeTable(value.lifeTable);
  if (typeof value.lifeTable !== "string" || lifeTable !== value.lifeTable) {
    validation("Synced life-expectancy data source is invalid");
  }
  return {
    birth: value.birth,
    birthZone: value.birthZone,
    sex: value.sex,
    expectancy: clampExpectancy(value.expectancy),
    expectancySource: value.expectancySource,
    lifeTable,
  };
}

export function mergePreferencePayload(state, value) {
  return { ...state, ...sanitizePreferencePayload(value) };
}

export function mergeProfilePayload(state, value) {
  return { ...state, ...sanitizeProfilePayload(value) };
}

/** Profile sync is never valid without preference sync. */
export function normalizeSyncConfig(value) {
  const preferences = Boolean(value?.preferences);
  return {
    preferences,
    profile: preferences && Boolean(value?.profile),
  };
}

function schemaFor(scope) {
  return scope === "preferences" ? PREFERENCE_SCHEMA : PROFILE_SCHEMA;
}

export function createSyncEnvelope(
  scope,
  data,
  writerId,
  updatedAt = Date.now(),
) {
  if (scope !== "preferences" && scope !== "profile") {
    validation("Unknown sync scope");
  }
  if (typeof writerId !== "string" || !writerId) {
    validation("Sync writer ID is required");
  }
  const sanitized =
    scope === "preferences"
      ? sanitizePreferencePayload(data)
      : sanitizeProfilePayload(data);
  return {
    schema: schemaFor(scope),
    version: SYNC_VERSION,
    writerId,
    updatedAt,
    data: sanitized,
  };
}

export function validateSyncEnvelope(value, scope) {
  if (
    !hasExactKeys(value, ["schema", "version", "writerId", "updatedAt", "data"])
  ) {
    validation("Synced data envelope is malformed");
  }
  if (value.schema !== schemaFor(scope)) {
    validation("Synced data envelope has an unknown schema");
  }
  if (value.version > SYNC_VERSION) {
    validation("Synced data was written by a newer Mortality version");
  }
  if (value.version !== SYNC_VERSION) {
    validation("Synced data envelope version is unsupported");
  }
  if (typeof value.writerId !== "string" || !value.writerId) {
    validation("Synced data envelope has no writer");
  }
  if (
    typeof value.updatedAt !== "number" ||
    !Number.isFinite(value.updatedAt) ||
    value.updatedAt < 0
  ) {
    validation("Synced data envelope timestamp is invalid");
  }
  return {
    ...value,
    data:
      scope === "preferences"
        ? sanitizePreferencePayload(value.data)
        : sanitizeProfilePayload(value.data),
  };
}

export function createConfigEnvelope(config, writerId, updatedAt = Date.now()) {
  if (typeof writerId !== "string" || !writerId) {
    validation("Sync writer ID is required");
  }
  const normalized = normalizeSyncConfig(config);
  return {
    schema: CONFIG_SCHEMA,
    version: SYNC_VERSION,
    writerId,
    updatedAt,
    ...normalized,
  };
}

export function validateConfigEnvelope(value) {
  if (
    !hasExactKeys(value, [
      "schema",
      "version",
      "writerId",
      "updatedAt",
      "preferences",
      "profile",
    ])
  ) {
    validation("Synced configuration envelope is malformed");
  }
  if (value.schema !== CONFIG_SCHEMA) {
    validation("Synced configuration envelope has an unknown schema");
  }
  if (value.version > SYNC_VERSION) {
    validation("Synced configuration was written by a newer Mortality version");
  }
  if (value.version !== SYNC_VERSION) {
    validation("Synced configuration version is unsupported");
  }
  if (typeof value.writerId !== "string" || !value.writerId) {
    validation("Synced configuration has no writer");
  }
  if (
    typeof value.updatedAt !== "number" ||
    !Number.isFinite(value.updatedAt) ||
    value.updatedAt < 0
  ) {
    validation("Synced configuration timestamp is invalid");
  }
  if (
    typeof value.preferences !== "boolean" ||
    typeof value.profile !== "boolean"
  ) {
    validation("Synced configuration flags are invalid");
  }
  return { ...value, ...normalizeSyncConfig(value) };
}

export function syncByteSize(value) {
  const json = JSON.stringify(value);
  if (typeof TextEncoder === "function") {
    return new TextEncoder().encode(json).byteLength;
  }
  return unescape(encodeURIComponent(json)).length;
}

function writerId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const values = globalThis.crypto.getRandomValues(new Uint32Array(4));
    return [...values]
      .map((value) => value.toString(16).padStart(8, "0"))
      .join("-");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function samePayload(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Create one runtime manager. Call initialize(state) before first render, then
 * stateChanged(state) after each immediate local save.
 */
export function createSyncManager({
  api = globalThis.browser ?? globalThis.chrome,
  persistLocal,
  onRemoteState = async () => {},
  onStatus = () => {},
  debounceMs = 750,
  now = () => Date.now(),
} = {}) {
  const syncStorage = api?.storage?.sync;
  const localStorage = api?.storage?.local;
  const changed = api?.storage?.onChanged;
  const available = Boolean(
    syncStorage?.get &&
    syncStorage?.set &&
    syncStorage?.remove &&
    localStorage?.get &&
    localStorage?.set &&
    changed?.addListener,
  );

  let currentState = null;
  let stateRevision = 0;
  let currentConfig = { preferences: false, profile: false };
  let id = null;
  let status = available ? "off" : "unavailable";
  let currentError = null;
  let busy = false;
  let activeOperations = 0;
  let initialized = false;
  let listener = null;
  let timer = null;
  let operationQueue = Promise.resolve();
  const initializationChanges = [];
  let retryOperation = null;
  let desiredPreferences = null;
  let desiredProfile = null;
  let lastPreferences = null;
  let lastProfile = null;
  const ownWrites = new Set();
  const ownRemoves = new Set();
  let changeSequence = 0;
  const latestOwnWriteSequence = new Map();

  const model = () => ({
    available,
    preferences: currentConfig.preferences,
    profile: currentConfig.profile,
    status,
    error: currentError,
    busy,
  });

  function notify() {
    onStatus(model());
  }

  function setStatus(nextStatus, error = null) {
    status = nextStatus;
    if (nextStatus === "error") currentError = error;
    else if (!retryOperation) currentError = null;
    notify();
  }

  function fail(error, retry, token) {
    console.error("Mortality: device sync could not update", error);
    retryOperation = { operation: retry, token };
    currentError = errorMessage(error);
    if (busy) notify();
    else setStatus("error", currentError);
  }

  async function perform(
    operation,
    retry = operation,
    token = Symbol("sync-operation"),
  ) {
    activeOperations += 1;
    busy = true;
    setStatus("syncing");
    const queued = operationQueue.then(operation);
    operationQueue = queued.catch(() => {});
    try {
      const result = await queued;
      if (retryOperation?.token === token) {
        retryOperation = null;
        currentError = null;
      }
      activeOperations -= 1;
      busy = activeOperations > 0;
      if (busy) return result;
      if (retryOperation) {
        setStatus("error", currentError);
        return result;
      }
      setStatus(currentConfig.preferences ? "synced" : "off");
      return result;
    } catch (error) {
      activeOperations -= 1;
      busy = activeOperations > 0;
      fail(error, retry, token);
      return false;
    }
  }

  async function loadWriterId() {
    const stored = (await localStorage.get(SYNC_METADATA_KEY))[
      SYNC_METADATA_KEY
    ];
    if (
      isRecord(stored) &&
      stored.version === SYNC_VERSION &&
      typeof stored.writerId === "string" &&
      stored.writerId
    ) {
      return stored.writerId;
    }
    const created = writerId();
    await localStorage.set({
      [SYNC_METADATA_KEY]: { version: SYNC_VERSION, writerId: created },
    });
    return created;
  }

  function fingerprint(value) {
    return JSON.stringify(value);
  }

  async function setSync(items) {
    const fingerprints = Object.values(items).map(fingerprint);
    for (const value of fingerprints) ownWrites.add(value);
    while (ownWrites.size > 100) {
      ownWrites.delete(ownWrites.values().next().value);
    }
    try {
      await syncStorage.set(items);
    } catch (error) {
      for (const value of fingerprints) ownWrites.delete(value);
      throw error;
    }
  }

  async function removeSync(keys) {
    const normalized = Array.isArray(keys) ? keys : [keys];
    for (const key of normalized) ownRemoves.add(key);
    try {
      await syncStorage.remove(keys);
    } catch (error) {
      for (const key of normalized) ownRemoves.delete(key);
      throw error;
    }
  }

  function preferenceEnvelope() {
    return createSyncEnvelope(
      "preferences",
      preferencePayload(currentState),
      id,
      now(),
    );
  }

  function profileEnvelope() {
    return createSyncEnvelope(
      "profile",
      profilePayload(currentState),
      id,
      now(),
    );
  }

  async function applyRemote(
    nextState,
    notifyController = true,
    expectedRevision = stateRevision,
  ) {
    if (samePayload(nextState, currentState)) return true;
    if (stateRevision !== expectedRevision) return false;
    await persistLocal(nextState);
    if (stateRevision !== expectedRevision) return false;
    if (notifyController && initialized) await onRemoteState(nextState);
    if (stateRevision !== expectedRevision) return false;
    currentState = nextState;
    return true;
  }

  function rememberCurrentScopes() {
    lastPreferences = JSON.stringify(preferencePayload(currentState));
    lastProfile = JSON.stringify(profilePayload(currentState));
  }

  async function reconcile(
    configEnvelope,
    supplied = {},
    notifyController = true,
    expectedRevision = stateRevision,
  ) {
    const config = validateConfigEnvelope(configEnvelope);
    currentConfig = normalizeSyncConfig(config);
    if (!currentConfig.preferences) {
      cancelTimer();
      desiredPreferences = null;
      desiredProfile = null;
      const missing = [SYNC_PREFERENCES_KEY, SYNC_PROFILE_KEY].filter(
        (key) => !(key in supplied),
      );
      const fetched = missing.length ? await syncStorage.get(missing) : {};
      const records = { ...fetched, ...supplied };
      const stale = [SYNC_PREFERENCES_KEY, SYNC_PROFILE_KEY].filter(
        (key) => records[key] !== undefined,
      );
      if (stale.length) await removeSync(stale);
      setStatus("off");
      return;
    }

    const missing = [];
    if (!(SYNC_PREFERENCES_KEY in supplied)) missing.push(SYNC_PREFERENCES_KEY);
    if (currentConfig.profile && !(SYNC_PROFILE_KEY in supplied)) {
      missing.push(SYNC_PROFILE_KEY);
    }
    if (!currentConfig.profile && !(SYNC_PROFILE_KEY in supplied)) {
      missing.push(SYNC_PROFILE_KEY);
    }
    const fetched = missing.length ? await syncStorage.get(missing) : {};
    const records = { ...fetched, ...supplied };
    const writes = {};
    const adoptionRevision = expectedRevision;
    let nextState = currentState;

    const preference = records[SYNC_PREFERENCES_KEY];
    if (preference === undefined) {
      writes[SYNC_PREFERENCES_KEY] = preferenceEnvelope();
    } else {
      if (stateRevision === adoptionRevision) desiredPreferences = null;
      nextState = mergePreferencePayload(
        nextState,
        validateSyncEnvelope(preference, "preferences").data,
      );
    }

    if (currentConfig.profile) {
      const profile = records[SYNC_PROFILE_KEY];
      if (profile === undefined) {
        writes[SYNC_PROFILE_KEY] = profileEnvelope();
      } else {
        if (stateRevision === adoptionRevision) desiredProfile = null;
        nextState = mergeProfilePayload(
          nextState,
          validateSyncEnvelope(profile, "profile").data,
        );
      }
    } else if (records[SYNC_PROFILE_KEY] !== undefined) {
      desiredProfile = null;
      await removeSync(SYNC_PROFILE_KEY);
    }

    if (Object.keys(writes).length) await setSync(writes);
    await applyRemote(nextState, notifyController, adoptionRevision);
    rememberCurrentScopes();
  }

  async function processChanges(changes, areaName) {
    if (areaName !== "sync") return;
    const eventRevision = stateRevision;
    const configChange = changes[SYNC_CONFIG_KEY];
    const preferenceChange = changes[SYNC_PREFERENCES_KEY];
    const profileChange = changes[SYNC_PROFILE_KEY];
    if (!configChange && !preferenceChange && !profileChange) return;
    const supplied = {};
    if (preferenceChange?.newValue !== undefined) {
      supplied[SYNC_PREFERENCES_KEY] = preferenceChange.newValue;
    }
    if (profileChange?.newValue !== undefined) {
      supplied[SYNC_PROFILE_KEY] = profileChange.newValue;
    }

    let config = configChange?.newValue;
    if (config === undefined) {
      config = (await syncStorage.get(SYNC_CONFIG_KEY))[SYNC_CONFIG_KEY];
    }
    if (config === undefined) {
      const records = await syncStorage.get([
        SYNC_CONFIG_KEY,
        SYNC_PREFERENCES_KEY,
        SYNC_PROFILE_KEY,
      ]);
      if (records[SYNC_CONFIG_KEY] !== undefined) {
        await reconcile(
          records[SYNC_CONFIG_KEY],
          {
            [SYNC_PREFERENCES_KEY]: Object.prototype.hasOwnProperty.call(
              supplied,
              SYNC_PREFERENCES_KEY,
            )
              ? supplied[SYNC_PREFERENCES_KEY]
              : records[SYNC_PREFERENCES_KEY],
            [SYNC_PROFILE_KEY]: Object.prototype.hasOwnProperty.call(
              supplied,
              SYNC_PROFILE_KEY,
            )
              ? supplied[SYNC_PROFILE_KEY]
              : records[SYNC_PROFILE_KEY],
          },
          true,
          eventRevision,
        );
        return;
      }
      currentConfig = { preferences: false, profile: false };
      cancelTimer();
      desiredPreferences = null;
      desiredProfile = null;
      const stale = [SYNC_PREFERENCES_KEY, SYNC_PROFILE_KEY].filter(
        (key) => supplied[key] !== undefined || records[key] !== undefined,
      );
      if (stale.length) await removeSync(stale);
      setStatus("off");
      return;
    }
    await reconcile(config, supplied, true, eventRevision);
    setStatus(currentConfig.preferences ? "synced" : "off");
  }

  function foreignChanges(changes, sequence) {
    const filtered = {};
    for (const key of [
      SYNC_CONFIG_KEY,
      SYNC_PREFERENCES_KEY,
      SYNC_PROFILE_KEY,
    ]) {
      const change = changes[key];
      if (!change) continue;
      const value = change.newValue;
      if (value === undefined && ownRemoves.has(key)) {
        ownRemoves.delete(key);
        latestOwnWriteSequence.set(key, sequence);
        continue;
      }
      const valueFingerprint =
        value === undefined ? null : fingerprint(change.newValue);
      if (valueFingerprint && ownWrites.has(valueFingerprint)) {
        ownWrites.delete(valueFingerprint);
        latestOwnWriteSequence.set(key, sequence);
        continue;
      }
      filtered[key] = change;
    }
    return filtered;
  }

  function currentlyAuthoritative(changes, sequence) {
    return Object.fromEntries(
      Object.entries(changes).filter(
        ([key]) => sequence >= (latestOwnWriteSequence.get(key) ?? 0),
      ),
    );
  }

  function queueChanges(changes, areaName) {
    if (areaName !== "sync") return;
    const sequence = ++changeSequence;
    const filtered = foreignChanges(changes, sequence);
    if (!Object.keys(filtered).length) return;
    if (!initialized) {
      initializationChanges.push({ changes: filtered, sequence });
      return;
    }

    activeOperations += 1;
    busy = true;
    setStatus("syncing");
    const operation = () => {
      const authoritative = currentlyAuthoritative(filtered, sequence);
      return Object.keys(authoritative).length
        ? processChanges(authoritative, areaName)
        : undefined;
    };
    const token = Symbol("sync-change");
    const queued = operationQueue.then(operation);
    operationQueue = queued.catch(() => {});
    queued.then(
      () => {
        activeOperations -= 1;
        busy = activeOperations > 0;
        if (busy) return;
        if (retryOperation) {
          setStatus("error", currentError);
          return;
        }
        setStatus(currentConfig.preferences ? "synced" : "off");
      },
      (error) => {
        activeOperations -= 1;
        busy = activeOperations > 0;
        fail(error, operation, token);
      },
    );
  }

  function installListener() {
    if (listener) return;
    listener = queueChanges;
    changed.addListener(listener);
  }

  async function reconcileFromStorage(notifyController) {
    const storageRevision = stateRevision;
    id = await loadWriterId();
    const records = await syncStorage.get([
      SYNC_CONFIG_KEY,
      SYNC_PREFERENCES_KEY,
      SYNC_PROFILE_KEY,
    ]);
    const config = records[SYNC_CONFIG_KEY];
    if (config === undefined) {
      currentConfig = { preferences: false, profile: false };
      const stale = [SYNC_PREFERENCES_KEY, SYNC_PROFILE_KEY].filter(
        (key) => records[key] !== undefined,
      );
      if (stale.length) await removeSync(stale);
      rememberCurrentScopes();
      return;
    }
    await reconcile(
      config,
      {
        [SYNC_PREFERENCES_KEY]: records[SYNC_PREFERENCES_KEY],
        [SYNC_PROFILE_KEY]: records[SYNC_PROFILE_KEY],
      },
      notifyController,
      storageRevision,
    );
  }

  async function drainInitializationChanges() {
    while (initializationChanges.length) {
      const pending = initializationChanges.splice(0);
      for (const entry of pending) {
        const authoritative = currentlyAuthoritative(
          entry.changes,
          entry.sequence,
        );
        if (Object.keys(authoritative).length) {
          await processChanges(authoritative, "sync");
        }
      }
    }
  }

  async function initialize(state) {
    currentState = state;
    notify();
    if (!available) return state;
    installListener();
    try {
      await reconcileFromStorage(false);
      await drainInitializationChanges();
      initialized = true;
      setStatus(currentConfig.preferences ? "synced" : "off");
      return currentState;
    } catch (error) {
      initialized = true;
      initializationChanges.length = 0;
      const retry = () => reconcileFromStorage(true);
      fail(error, retry, Symbol("sync-initialize"));
      return currentState;
    }
  }

  function cancelTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function scheduleTimer() {
    cancelTimer();
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, debounceMs);
  }

  async function writeDesired() {
    const preference = desiredPreferences;
    const profile = desiredProfile;
    if (!preference && !profile) return;
    const items = {};
    if (preference && currentConfig.preferences) {
      items[SYNC_PREFERENCES_KEY] = createSyncEnvelope(
        "preferences",
        preference,
        id,
        now(),
      );
    }
    if (profile && currentConfig.profile) {
      items[SYNC_PROFILE_KEY] = createSyncEnvelope(
        "profile",
        profile,
        id,
        now(),
      );
    }
    if (!Object.keys(items).length) return;
    await setSync(items);
    if (preference && items[SYNC_PREFERENCES_KEY]) {
      lastPreferences = JSON.stringify(preference);
      if (samePayload(desiredPreferences, preference))
        desiredPreferences = null;
    }
    if (profile && items[SYNC_PROFILE_KEY]) {
      lastProfile = JSON.stringify(profile);
      if (samePayload(desiredProfile, profile)) desiredProfile = null;
    }
  }

  async function flush() {
    cancelTimer();
    if (!available || !id || !currentConfig.preferences) return false;
    return perform(writeDesired, writeDesired);
  }

  function stateChanged(state) {
    stateRevision += 1;
    currentState = state;
    if (!available || !initialized || !currentConfig.preferences) return;
    const preferences = preferencePayload(state);
    if (JSON.stringify(preferences) !== lastPreferences) {
      desiredPreferences = preferences;
    }
    if (currentConfig.profile) {
      const profile = profilePayload(state);
      if (JSON.stringify(profile) !== lastProfile) desiredProfile = profile;
    }
    if (!desiredPreferences && !desiredProfile) return;
    setStatus("syncing");
    scheduleTimer();
  }

  async function enablePreferences() {
    const adoptionRevision = stateRevision;
    const records = await syncStorage.get(SYNC_PREFERENCES_KEY);
    const remote = records[SYNC_PREFERENCES_KEY];
    let nextState = currentState;
    const items = {
      [SYNC_CONFIG_KEY]: createConfigEnvelope(
        { preferences: true, profile: false },
        id,
        now(),
      ),
    };
    if (remote === undefined) {
      items[SYNC_PREFERENCES_KEY] = preferenceEnvelope();
    } else {
      nextState = mergePreferencePayload(
        nextState,
        validateSyncEnvelope(remote, "preferences").data,
      );
    }
    await setSync(items);
    currentConfig = { preferences: true, profile: false };
    const applied = await applyRemote(nextState, true, adoptionRevision);
    if (!applied) {
      desiredPreferences = preferencePayload(currentState);
      await writeDesired();
    }
    rememberCurrentScopes();
  }

  async function disablePreferences() {
    cancelTimer();
    desiredPreferences = null;
    desiredProfile = null;
    const config = createConfigEnvelope(
      { preferences: false, profile: false },
      id,
      now(),
    );
    await setSync({ [SYNC_CONFIG_KEY]: config });
    currentConfig = { preferences: false, profile: false };
    await removeSync([SYNC_PREFERENCES_KEY, SYNC_PROFILE_KEY]);
  }

  async function togglePreferences(enabled) {
    if (!available || !id || busy || enabled === currentConfig.preferences)
      return false;
    const operation = enabled ? enablePreferences : disablePreferences;
    return perform(operation, operation);
  }

  async function enableProfile() {
    const adoptionRevision = stateRevision;
    const records = await syncStorage.get(SYNC_PROFILE_KEY);
    const remote = records[SYNC_PROFILE_KEY];
    let nextState = currentState;
    const items = {
      [SYNC_CONFIG_KEY]: createConfigEnvelope(
        { preferences: true, profile: true },
        id,
        now(),
      ),
    };
    if (desiredPreferences) {
      items[SYNC_PREFERENCES_KEY] = createSyncEnvelope(
        "preferences",
        desiredPreferences,
        id,
        now(),
      );
    }
    if (remote === undefined) {
      items[SYNC_PROFILE_KEY] = profileEnvelope();
    } else {
      nextState = mergeProfilePayload(
        nextState,
        validateSyncEnvelope(remote, "profile").data,
      );
    }
    await setSync(items);
    currentConfig = { preferences: true, profile: true };
    desiredPreferences = null;
    const applied = await applyRemote(nextState, true, adoptionRevision);
    if (!applied) {
      desiredPreferences = preferencePayload(currentState);
      desiredProfile = profilePayload(currentState);
      await writeDesired();
    }
    rememberCurrentScopes();
  }

  async function disableProfile() {
    cancelTimer();
    desiredProfile = null;
    const items = {
      [SYNC_CONFIG_KEY]: createConfigEnvelope(
        { preferences: true, profile: false },
        id,
        now(),
      ),
    };
    if (desiredPreferences) {
      items[SYNC_PREFERENCES_KEY] = createSyncEnvelope(
        "preferences",
        desiredPreferences,
        id,
        now(),
      );
    }
    await setSync(items);
    currentConfig = { preferences: true, profile: false };
    const writtenPreference = items[SYNC_PREFERENCES_KEY]?.data;
    if (writtenPreference) {
      lastPreferences = JSON.stringify(writtenPreference);
      if (samePayload(desiredPreferences, writtenPreference)) {
        desiredPreferences = null;
      }
    }
    desiredProfile = null;
    await removeSync(SYNC_PROFILE_KEY);
    if (desiredPreferences) await writeDesired();
  }

  async function toggleProfile(enabled) {
    if (
      !available ||
      !id ||
      busy ||
      !currentConfig.preferences ||
      enabled === currentConfig.profile
    ) {
      return false;
    }
    const operation = enabled ? enableProfile : disableProfile;
    return perform(operation, operation);
  }

  async function retry() {
    if (!available || busy || !retryOperation) return false;
    const pending = retryOperation;
    return perform(pending.operation, pending.operation, pending.token);
  }

  function pageFlush() {
    if (document.visibilityState === "hidden") void flush();
  }

  if (available && typeof globalThis.addEventListener === "function") {
    globalThis.addEventListener("pagehide", flush);
    globalThis.document?.addEventListener("visibilitychange", pageFlush);
  }

  function destroy() {
    cancelTimer();
    if (listener && typeof changed.removeListener === "function") {
      changed.removeListener(listener);
    }
    listener = null;
    if (available && typeof globalThis.removeEventListener === "function") {
      globalThis.removeEventListener("pagehide", flush);
      globalThis.document?.removeEventListener("visibilitychange", pageFlush);
    }
  }

  return {
    initialize,
    stateChanged,
    togglePreferences,
    toggleProfile,
    retry,
    flush,
    destroy,
    model,
  };
}
