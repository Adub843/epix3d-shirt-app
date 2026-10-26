// Saved designs, kept in this browser (IndexedDB) so nothing leaves the device until the customer orders.
// A record is { id, name, saved, thumb, state, sources }: state is the builder's layers and shirt choice,
// sources maps each image id to its original file (Blob). The record with id "draft" is the autosave.
// Every call resolves to a safe value (null or []) when storage is blocked, as in some private windows.

const DB = "shirt-builder", STORE = "designs";
let dbp = null;
function db(name) {
  dbp ??= new Promise((ok, fail) => {
    const req = indexedDB.open(`${DB}-${name}`, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
  return dbp;
}
async function run(name, mode, fn) {
  try {
    const d = await db(name);
    return await new Promise((ok, fail) => {
      const tx = d.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => ok(req?.result ?? null);
      tx.onerror = tx.onabort = () => fail(tx.error);
    });
  } catch { return null; }
}

// `name` keeps each brand's designs apart when two builders share a browser.
export const openStore = (name = "default") => ({
  save: (rec) => run(name, "readwrite", (s) => s.put({ ...rec, saved: Date.now() })),
  get: (id) => run(name, "readonly", (s) => s.get(id)),
  remove: (id) => run(name, "readwrite", (s) => s.delete(id)),
  // newest first, without the autosave
  list: async () => ((await run(name, "readonly", (s) => s.getAll())) ?? []).filter((r) => r.id !== "draft").sort((a, b) => b.saved - a.saved),
});
