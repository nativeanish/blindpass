import {
  BlindPassClient,
  emptyState,
  type ClientState,
  type CredentialStore,
} from "@blindpass/client";
import { buffer } from "@blindpass/shared";
function openVault(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("blindpass-vault", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("private");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function get<T>(key: string): Promise<T | undefined> {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("private", "readonly");
    const request = tx.objectStore("private").get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}
async function set(key: string, value: unknown) {
  const db = await openVault();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("private", "readwrite");
    tx.objectStore("private").put(value, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}
interface Ciphertext {
  iv: Uint8Array;
  data: ArrayBuffer;
}
export class BrowserVault implements CredentialStore {
  private async key() {
    let key = await get<CryptoKey>("key");
    if (!key) {
      key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
      await set("key", key);
    }
    return key;
  }
  async load() {
    const record = await get<Ciphertext>("state");
    if (!record) return emptyState();
    const bytes = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: buffer(record.iv),
        additionalData: new TextEncoder().encode("blindpass-browser-v1"),
      },
      await this.key(),
      record.data,
    );
    return JSON.parse(new TextDecoder().decode(bytes)) as ClientState;
  }
  async save(state: ClientState) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode("blindpass-browser-v1"),
      },
      await this.key(),
      new TextEncoder().encode(JSON.stringify(state)),
    );
    await set("state", { iv, data });
  }
  async exclusive<T>(fn: () => Promise<T>) {
    if (!navigator.locks)
      throw new Error(
        "A secure browser with Web Locks is required. Open localhost or use HTTPS.",
      );
    return navigator.locks.request("blindpass-vault", fn);
  }
}
let sdk: BlindPassClient | undefined;
export function browserClient() {
  return (sdk ??= new BlindPassClient({
    baseUrl: "",
    store: new BrowserVault(),
    issuer: window.location.host,
    expectedFingerprint: process.env.NEXT_PUBLIC_BLINDPASS_FINGERPRINT,
  }));
}
