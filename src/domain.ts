/**
 * Persistent domain records. Collections are reached only through explicit
 * index records; this module never scans a Redis/Durable Object keyspace.
 */
import type { Context, StorageAdapter } from "grammy";
import { defaultRedisStorage } from "./toolkit/index.js";

export interface Signal {
  id: string;
  timestamp: string;
  provider: string;
  asset: string;
  direction: "CALL" | "PUT";
  expiry: string;
  stakeSuggestion: string;
  confidence: string;
  details: string;
  imageUrl?: string;
}

export interface Subscriber {
  telegramId: string;
  displayName: string;
  timezone: string;
  notificationPreferences: { signalPrompts: boolean };
}

export interface OptInRecord {
  signalId: string;
  subscriberId: string;
  optedIn: boolean;
  timestamp: string;
}

interface KV {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

interface WorkerBindings {
  CHAT_DO?: { idFromName(name: string): unknown; get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> } };
}

class WorkerKV implements KV {
  constructor(private readonly bindings: WorkerBindings) {}
  private async request(path: string, init?: RequestInit): Promise<Response> {
    const namespace = this.bindings.CHAT_DO;
    if (!namespace) throw new Error("persistent storage is unavailable");
    return namespace.get(namespace.idFromName("domain")).fetch(`https://do${path}`, init);
  }
  async get<T>(key: string): Promise<T | undefined> {
    const response = await this.request(`/domain?key=${encodeURIComponent(key)}`);
    if (response.status === 204) return undefined;
    if (!response.ok) throw new Error("persistent storage is unavailable");
    return (await response.json()) as T;
  }
  async put<T>(key: string, value: T): Promise<void> {
    const response = await this.request("/domain", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    if (!response.ok) throw new Error("persistent storage is unavailable");
  }
}

class RedisKV implements KV {
  private adapter() {
    const url = typeof process === "undefined" ? undefined : process.env.REDIS_URL;
    if (!url) throw new Error("persistent storage is unavailable");
    return nodeAdapter ??= defaultRedisStorage<unknown>(url);
  }
  async get<T>(key: string): Promise<T | undefined> {
    return (await this.adapter().read(`pocket-options:${key}`)) as T | undefined;
  }
  async put<T>(key: string, value: T): Promise<void> {
    await this.adapter().write(`pocket-options:${key}`, value);
  }
}

// This holds only a connection adapter. Domain records always remain in Redis.
let nodeAdapter: StorageAdapter<unknown> | undefined;

function storage(ctx: Context): KV {
  const bindings = (ctx as Context & { env?: WorkerBindings }).env;
  return bindings?.CHAT_DO ? new WorkerKV(bindings) : new RedisKV();
}

function subscriberKey(id: string) { return `subscriber:${id}`; }
function signalKey(id: string) { return `signal:${id}`; }
function optInKey(signalId: string, subscriberId: string) { return `optin:${signalId}:${subscriberId}`; }

export async function upsertSubscriber(ctx: Context): Promise<Subscriber> {
  const id = String(ctx.from?.id ?? ctx.chat?.id);
  if (!id) throw new Error("missing subscriber");
  const kv = storage(ctx);
  const old = await kv.get<Subscriber>(subscriberKey(id));
  const subscriber: Subscriber = old ?? {
    telegramId: id,
    displayName: ctx.from?.first_name?.trim() || "Subscriber",
    timezone: "UTC",
    notificationPreferences: { signalPrompts: true },
  };
  await kv.put(subscriberKey(id), subscriber);
  const ids = (await kv.get<string[]>("subscribers:index")) ?? [];
  if (!ids.includes(id)) await kv.put("subscribers:index", [...ids, id]);
  return subscriber;
}

export async function getSubscriber(ctx: Context, id: string): Promise<Subscriber | undefined> {
  return storage(ctx).get<Subscriber>(subscriberKey(id));
}

export async function setTimezone(ctx: Context, timezone: string): Promise<Subscriber> {
  const subscriber = await upsertSubscriber(ctx);
  const changed = { ...subscriber, timezone };
  await storage(ctx).put(subscriberKey(subscriber.telegramId), changed);
  return changed;
}

export async function listSubscribers(ctx: Context): Promise<Subscriber[]> {
  const kv = storage(ctx);
  const ids = (await kv.get<string[]>("subscribers:index")) ?? [];
  const records = await Promise.all(ids.map((id) => kv.get<Subscriber>(subscriberKey(id))));
  return records.filter((record): record is Subscriber => record !== undefined);
}

export async function saveSignal(ctx: Context, signal: Signal): Promise<void> {
  const kv = storage(ctx);
  await kv.put(signalKey(signal.id), signal);
  const ids = (await kv.get<string[]>("signals:index")) ?? [];
  await kv.put("signals:index", [signal.id, ...ids.filter((id) => id !== signal.id)].slice(0, 200));
}

export async function getSignal(ctx: Context, id: string): Promise<Signal | undefined> {
  return storage(ctx).get<Signal>(signalKey(id));
}

export async function listSignals(ctx: Context, limit = 10): Promise<Signal[]> {
  const kv = storage(ctx);
  const ids = ((await kv.get<string[]>("signals:index")) ?? []).slice(0, limit);
  const records = await Promise.all(ids.map((id) => kv.get<Signal>(signalKey(id))));
  return records.filter((record): record is Signal => record !== undefined);
}

export async function recordChoice(ctx: Context, signalId: string, optedIn: boolean, timestamp: string): Promise<OptInRecord> {
  const subscriber = await upsertSubscriber(ctx);
  const kv = storage(ctx);
  const record: OptInRecord = { signalId, subscriberId: subscriber.telegramId, optedIn, timestamp };
  await kv.put(optInKey(signalId, subscriber.telegramId), record);
  const indexKey = `optins:${subscriber.telegramId}`;
  const ids = (await kv.get<string[]>(indexKey)) ?? [];
  if (!ids.includes(signalId)) await kv.put(indexKey, [signalId, ...ids].slice(0, 200));
  return record;
}

export async function getChoice(ctx: Context, signalId: string, subscriberId: string): Promise<OptInRecord | undefined> {
  return storage(ctx).get<OptInRecord>(optInKey(signalId, subscriberId));
}

export async function listChoices(ctx: Context, subscriberId: string): Promise<OptInRecord[]> {
  const kv = storage(ctx);
  const ids = (await kv.get<string[]>(`optins:${subscriberId}`)) ?? [];
  const records = await Promise.all(ids.map((id) => kv.get<OptInRecord>(optInKey(id, subscriberId))));
  return records.filter((record): record is OptInRecord => record !== undefined);
}

export async function signalChoiceStats(ctx: Context, signalId: string): Promise<{ optedIn: number; ignored: number }> {
  const subscribers = await listSubscribers(ctx);
  const records = await Promise.all(subscribers.map((subscriber) => getChoice(ctx, signalId, subscriber.telegramId)));
  return records.reduce((total, record) => ({
    optedIn: total.optedIn + (record?.optedIn ? 1 : 0),
    ignored: total.ignored + (record && !record.optedIn ? 1 : 0),
  }), { optedIn: 0, ignored: 0 });
}
