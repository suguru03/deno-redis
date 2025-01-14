type Reader = Deno.Reader;
type Writer = Deno.Writer;
type Closer = Deno.Closer;

import { BufReader, BufWriter } from "./vendor/https/deno.land/std/io/bufio.ts";
import { psubscribe, subscribe } from "./pubsub.ts";
import { CommandFunc, RedisRawReply, sendCommand, muxExecutor } from "./io.ts";
import { createRedisPipeline } from "./pipeline.ts";
import {
  RedisCommands,
  Status,
  Bulk,
  Integer,
  ConditionalArray,
  BulkString,
  Raw,
  BulkNil,
} from "./command.ts";
import {
  XMaxlen,
  XReadStreamRaw,
  XId,
  XIdAdd,
  XKeyId,
  XReadIdData,
  XClaimOpts,
  XIdInput,
  XIdNeg,
  XIdPos,
  XAddFieldValues,
  XClaimJustXId,
  XClaimMessages,
  XReadGroupOpts,
  StartEndCount,
  parseXReadReply,
  parseXMessage,
  parseXPendingConsumers,
  parseXPendingCounts,
  parseXGroupDetail,
  xidstr,
  parseXId,
  rawnum,
  rawstr,
  isCondArray,
  isNumber,
  isString,
  convertMap,
  XKeyIdGroup,
  XKeyIdGroupLike,
  XInfoGroup,
  XKeyIdLike,
} from "./stream.ts";
import type { Connection, CommandExecutor } from "./connection.ts";

export type Redis = RedisCommands & {
  executor: CommandExecutor<RedisRawReply>;
};

class RedisImpl implements RedisCommands {
  get isClosed() {
    return this.connection?.isClosed;
  }

  get isConnected() {
    return this.connection?.isConnected;
  }

  get executor() {
    return this.connection.executor!;
  }

  constructor(
    private connection: Connection<RedisRawReply>,
  ) {
  }

  close() {
    return this.connection?.close();
  }

  async execStatusReply(
    command: string,
    ...args: (string | number)[]
  ): Promise<Status> {
    const [_, reply] = await this.connection?.executor!.exec(command, ...args);
    return reply as Status;
  }

  async execIntegerReply(
    command: string,
    ...args: (string | number)[]
  ): Promise<Integer> {
    const [_, reply] = await this.connection!.exec(command, ...args);
    return reply as number;
  }

  async execBulkReply<T extends Bulk = Bulk>(
    command: string,
    ...args: (string | number)[]
  ): Promise<T> {
    const [_, reply] = await this.connection!.exec(command, ...args);
    return reply as T;
  }

  async execArrayReply<T extends Raw = Raw>(
    command: string,
    ...args: (string | number)[]
  ): Promise<T[]> {
    const [_, reply] = await this.connection!.exec(command, ...args);
    return reply as T[];
  }

  async execIntegerOrNilReply(
    command: string,
    ...args: (string | number)[]
  ): Promise<Integer | BulkNil> {
    const [_, reply] = await this.connection!.exec(command, ...args);
    return reply as Integer | BulkNil;
  }

  async execStatusOrNilReply(
    command: string,
    ...args: (string | number)[]
  ): Promise<Status | BulkNil> {
    const [_, reply] = await this.connection!.exec(command, ...args);
    return reply as Status | BulkNil;
  }

  acl_cat(categoryname?: string) {
    if (categoryname) {
      return this.execArrayReply<BulkString>("ACL", "CAT", categoryname);
    } else {
      return this.execArrayReply<BulkString>("ACL", "CAT");
    }
  }

  acl_deluser(username: string) {
    return this.execIntegerReply("ACL", "DELUSER", username);
  }

  acl_genpass(bits?: Integer) {
    if (bits) {
      return this.execStatusReply("ACL", "GENPASS", bits);
    } else {
      return this.execStatusReply("ACL", "GENPASS");
    }
  }

  acl_getuser(username: string) {
    return this.execArrayReply<BulkString>("ACL", "GETUSER", username);
  }

  acl_help() {
    return this.execArrayReply<BulkString>("ACL", "HELP");
  }

  acl_list() {
    return this.execArrayReply<BulkString>("ACL", "LIST");
  }

  acl_load() {
    return this.execStatusReply("ACL", "LOAD");
  }

  acl_log(param: string | number) {
    if (param === "RESET" || param === "reset") {
      return this.execStatusReply("ACL", "LOG", "RESET");
    }
    return this.execArrayReply<BulkString>("ACL", "LOG", param);
  }

  acl_save() {
    return this.execStatusReply("ACL", "SAVE");
  }

  acl_setuser(username: string, rule: string) {
    return this.execStatusReply("ACL", "SETUSER", username, rule);
  }

  acl_users() {
    return this.execArrayReply<BulkString>("ACL", "USERS");
  }

  acl_whoami() {
    return this.execStatusReply("ACL", "WHOAMI");
  }

  append(key: string, value: string | number) {
    return this.execIntegerReply("APPEND", key, value);
  }

  auth(param1: string, param2?: string) {
    if (typeof param2 === "string") {
      return this.execStatusReply("AUTH", param1, param2);
    }
    return this.execStatusReply("AUTH", param1);
  }

  bgrewriteaof() {
    return this.execStatusReply("BGREWRITEAOF");
  }

  bgsave() {
    return this.execStatusReply("BGSAVE");
  }

  bitcount(key: string, start?: number, end?: number) {
    if (start != null && end != null) {
      return this.execIntegerReply("BITCOUNT", key, start, end);
    } else if (start != null) {
      return this.execIntegerReply("BITCOUNT", key, start);
    } else return this.execIntegerReply("BITCOUNT", key);
  }

  bitfield(key: string, opts?: {
    get?: { type: string; offset: number | string };
    set?: { type: string; offset: number | string; value: number };
    incrby?: { type: string; offset: number | string; increment: number };
    overflow?: "WRAP" | "SAT" | "FAIL";
  }) {
    const args: (number | string)[] = [key];
    if (opts?.get) {
      const { type, offset } = opts.get;
      args.push("GET", type, offset);
    }
    if (opts?.set) {
      const { type, offset, value } = opts.set;
      args.push("SET", type, offset, value);
    }
    if (opts?.incrby) {
      const { type, offset, increment } = opts.incrby;
      args.push("INCRBY", type, offset, increment);
    }
    if (opts?.overflow) {
      args.push("OVERFLOW", opts.overflow);
    }
    return this.execArrayReply("BITFIELD", ...args) as Promise<number[]>;
  }

  bitop(operation: string, destkey: string, ...keys: string[]) {
    return this.execIntegerReply("BITOP", operation, destkey, ...keys);
  }

  bitpos(key: string, bit: number, start?: number, end?: number) {
    if (start != null && end != null) {
      return this.execIntegerReply("BITPOS", key, bit, start, end);
    } else if (start != null) {
      return this.execIntegerReply("BITPOS", key, bit, start);
    } else {
      return this.execIntegerReply("BITPOS", key, bit);
    }
  }

  blpop(keys: string[], timeout: number) {
    if (typeof keys === "string") {
      return this.execArrayReply<Bulk>("BLPOP", keys, timeout);
    } else {
      return this.execArrayReply<Bulk>("BLPOP", ...keys, timeout);
    }
  }

  brpop(keys: string[], timeout: number) {
    if (typeof keys === "string") {
      return this.execArrayReply<Bulk>("BRPOP", keys, timeout);
    } else {
      return this.execArrayReply<Bulk>("BRPOP", ...keys, timeout);
    }
  }

  brpoplpush(source: string, destination: string, timeout: number) {
    return this.execBulkReply("BRPOPLPUSH", source, destination, timeout);
  }

  bzpopmin(key: string | string[], timeout: number): Promise<
    [BulkString, BulkString, BulkString] | []
  >;
  bzpopmin(keys: string | string[], timeout: number) {
    if (typeof keys === "string") {
      return this.execArrayReply<Bulk>("BZPOPMIN", keys, timeout);
    } else {
      return this.execArrayReply<Bulk>("BZPOPMIN", ...keys, timeout);
    }
  }

  bzpopmax(key: string | string[], timeout: number): Promise<
    [BulkString, BulkString, BulkString] | []
  >;
  bzpopmax(keys: string[], timeout: number) {
    if (typeof keys === "string") {
      return this.execArrayReply("BZPOPMAX", keys, timeout);
    } else {
      return this.execArrayReply("BZPOPMAX", ...keys, timeout);
    }
  }

  cluster_addslots(...slots: number[]): Promise<Status> {
    return this.execStatusReply("CLUSTER", "ADDSLOTS", ...slots);
  }

  cluster_countfailurereports(node_id: string): Promise<Integer> {
    return this.execIntegerReply("CLUSTER", "COUNT-FAILURE-REPORTS", node_id);
  }

  cluster_countkeysinslot(slot: number): Promise<Integer> {
    return this.execIntegerReply("CLUSTER", "COUNTKEYSINSLOT", slot);
  }

  cluster_delslots(...slots: number[]): Promise<Status> {
    return this.execStatusReply("CLUSTER", "DELSLOTS", ...slots);
  }

  cluster_failover(opt?: "FORCE" | "TAKEOVER"): Promise<Status> {
    if (opt) {
      return this.execStatusReply("CLUSTER", "FAILOVER", opt);
    }
    return this.execStatusReply("CLUSTER", "FAILOVER");
  }

  cluster_flushslots(): Promise<Status> {
    return this.execStatusReply("CLUSTER", "FLUSHSLOTS");
  }

  cluster_forget(node_id: string): Promise<Status> {
    return this.execStatusReply("CLUSTER", "FORGET", node_id);
  }

  cluster_getkeysinslot(slot: number, count: number): Promise<BulkString[]> {
    return this.execArrayReply<BulkString>(
      "CLUSTER",
      "GETKEYSINSLOT",
      slot,
      count,
    );
  }

  cluster_info(): Promise<BulkString> {
    return this.execStatusReply("CLUSTER", "INFO");
  }

  cluster_keyslot(key: string): Promise<Integer> {
    return this.execIntegerReply("CLUSTER", "KEYSLOT", key);
  }

  cluster_meet(ip: string, port: number): Promise<Status> {
    return this.execStatusReply("CLUSTER", "MEET", ip, port);
  }

  cluster_myid(): Promise<BulkString> {
    return this.execStatusReply("CLUSTER", "MYID");
  }

  cluster_nodes(): Promise<BulkString> {
    return this.execBulkReply("CLUSTER", "NODES");
  }

  cluster_replicas(node_id: string): Promise<BulkString[]> {
    return this.execArrayReply<BulkString>("CLUSTER", "REPLICAS", node_id);
  }

  cluster_replicate(node_id: string): Promise<Status> {
    return this.execStatusReply("CLUSTER", "REPLICATE", node_id);
  }

  cluster_reset(opt?: "HARD" | "SOFT"): Promise<Status> {
    if (opt) {
      return this.execStatusReply("CLUSTER", "RESET", opt);
    }
    return this.execStatusReply("CLUSTER", "RESET");
  }

  cluster_saveconfig(): Promise<Status> {
    return this.execStatusReply("CLUSTER", "SAVECONFIG");
  }

  cluster_setslot(
    slot: number,
    subcommand: "IMPORTING" | "MIGRATING" | "NODE" | "STABLE",
    node_id?: string,
  ): Promise<Status> {
    if (node_id) {
      return this.execStatusReply(
        "CLUSTER",
        "SETSLOT",
        slot,
        subcommand,
        node_id,
      );
    }
    return this.execStatusReply("CLUSTER", "SETSLOT", slot, subcommand);
  }

  cluster_slaves(node_id: string): Promise<BulkString[]> {
    return this.execArrayReply<BulkString>("CLUSTER", "SLAVES", node_id);
  }

  cluster_slots(): Promise<ConditionalArray> {
    return this.execArrayReply("CLUSTER", "SLOTS");
  }

  command() {
    return this.execArrayReply("COMMAND") as Promise<
      [BulkString, Integer, BulkString[], Integer, Integer, Integer]
    >;
  }

  command_count() {
    return this.execIntegerReply("COMMAND", "COUNT");
  }

  command_getkeys() {
    return this.execArrayReply<BulkString>("COMMAND", "GETKEYS");
  }

  command_info(...command_names: string[]) {
    return this.execArrayReply("COMMAND", "INFO", ...command_names) as Promise<
      [
        [
          BulkString,
          Integer,
          BulkString[],
          Integer,
          Integer,
          Integer,
          [BulkString[]],
        ] | BulkNil,
      ]
    >;
  }

  config_get(parameter: string) {
    return this.execArrayReply<BulkString>("CONFIG", "GET", parameter);
  }

  config_rewrite() {
    return this.execStatusReply("CONFIG", "REWRITE");
  }

  config_set(parameter: string, value: string | number) {
    return this.execStatusReply("CONFIG", "SET", parameter, value);
  }

  config_resetstat() {
    return this.execStatusReply("CONFIG", "RESETSTAT");
  }

  dbsize() {
    return this.execIntegerReply("DBSIZE");
  }

  debug_object(key: string) {
    return this.execStatusReply("DEBUG", "OBJECT", key);
  }

  debug_segfault() {
    return this.execStatusReply("DEBUG", "SEGFAULT");
  }

  decr(key: string) {
    return this.execIntegerReply("DECR", key);
  }

  decrby(key: string, decrement: number) {
    return this.execIntegerReply("DECRBY", key, decrement);
  }

  del(key: string, ...keys: string[]) {
    return this.execIntegerReply("DEL", key, ...keys);
  }

  discard() {
    return this.execStatusReply("DISCARD");
  }

  dump(key: string) {
    return this.execBulkReply("DUMP", key);
  }

  echo(message: string) {
    return this.execBulkReply<BulkString>("ECHO", message);
  }

  eval(
    script: string,
    numkeys: number,
    keys: string | string[],
    arg: string | string[],
  ) {
    return this.doEval("EVAL", script, numkeys, keys, arg);
  }

  evalsha(
    sha1: string,
    numkeys: number,
    keys: string | string[],
    args: string | string[],
  ) {
    return this.doEval("EVALSHA", sha1, numkeys, keys, args);
  }

  private async doEval(
    cmd: string,
    script: string,
    numkeys: number,
    keys: string | string[],
    args: string | string[],
  ) {
    const _args = [script, numkeys];
    if (typeof keys === "string") {
      _args.push(keys);
    } else {
      _args.push(...keys);
    }
    if (typeof args === "string") {
      _args.push(args);
    } else {
      _args.push(...args);
    }
    const [_, raw] = await this.connection!.exec(cmd, ..._args);
    return raw;
  }

  exec() {
    return this.execArrayReply("EXEC");
  }

  exists(...keys: string[]) {
    return this.execIntegerReply("EXISTS", ...keys);
  }

  expire(key: string, seconds: number) {
    return this.execIntegerReply("EXPIRE", key, seconds);
  }

  expireat(key: string, timestamp: string) {
    return this.execIntegerReply("EXPIREAT", key, timestamp);
  }

  flushall(async: boolean) {
    const args = async ? ["ASYNC"] : [];
    return this.execStatusReply("FLUSHALL", ...args);
  }

  flushdb(async: boolean) {
    const args = async ? ["ASYNC"] : [];
    return this.execStatusReply("FLUSHDB", ...args);
  }

  // deno-lint-ignore no-explicit-any
  geoadd(key: string, ...args: any[]) {
    const _args = [];
    if (Array.isArray(args[0])) {
      for (const triple of args) {
        _args.push(...triple);
      }
    } else {
      _args.push(...args);
    }
    return this.execIntegerReply("GEOADD", key, ..._args);
  }

  geohash(key: string, ...members: string[]) {
    return this.execArrayReply<Bulk>("GEOHASH", key, ...members);
  }

  geopos(key: string, ...members: string[]) {
    return this.execArrayReply<[number, number] | undefined>(
      "GEOPOS",
      key,
      ...members,
    );
  }

  geodist(key: string, member1: string, member2: string, unit?: string) {
    if (unit) {
      return this.execBulkReply("GEODIST", key, member1, member2, unit);
    } else {
      return this.execBulkReply("GEODIST", key, member1, member2);
    }
  }

  georadius(
    key: string,
    longitude: number,
    latitude: number,
    radius: number,
    unit: string,
    opts?: {
      withCoord?: boolean;
      withDist?: boolean;
      withHash?: boolean;
      count?: number;
      sort?: "ASC" | "DESC";
      store?: string;
      storeDist?: string;
    },
  ) {
    const args = this.pushGeoRadiusOpts(
      [key, longitude, latitude, radius, unit],
      opts,
    );
    return this.execArrayReply("GEORADIUS", ...args);
  }

  georadiusbymember(
    key: string,
    member: string,
    radius: number,
    unit: string,
    opts?: {
      withCoord?: boolean;
      withDist?: boolean;
      withHash?: boolean;
      count?: number;
      sort?: "ASC" | "DESC";
      store?: string;
      storeDist?: string;
    },
  ) {
    const args = this.pushGeoRadiusOpts([key, member, radius, unit], opts);
    return this.execArrayReply("GEORADIUSBYMEMBER", ...args);
  }

  private pushGeoRadiusOpts(
    args: (string | number)[],
    opts?: {
      withCoord?: boolean;
      withDist?: boolean;
      withHash?: boolean;
      count?: number;
      sort?: "ASC" | "DESC";
      store?: string;
      storeDist?: string;
    },
  ) {
    if (!opts) return args;
    if (opts.withCoord) {
      args.push("WITHCOORD");
    }
    if (opts.withDist) {
      args.push("WITHDIST");
    }
    if (opts.withHash) {
      args.push("WITHHASH");
    }
    if (typeof opts.count === "number") {
      args.push(opts.count);
    }
    if (opts.sort === "ASC" || opts.sort === "DESC") {
      args.push(opts.sort);
    }
    if (typeof opts.store === "string") {
      args.push(opts.store);
    }
    if (typeof opts.storeDist === "string") {
      args.push(opts.storeDist);
    }
    return args;
  }

  get(key: string) {
    return this.execBulkReply("GET", key);
  }

  getbit(key: string, offset: number) {
    return this.execIntegerReply("GETBIT", key, offset);
  }

  getrange(key: string, start: number, end: number) {
    return this.execBulkReply<BulkString>("GETRANGE", key, start, end);
  }

  getset(key: string, value: string) {
    return this.execBulkReply("GETSET", key, value);
  }

  hdel(key: string, field: string, ...fields: string[]) {
    return this.execIntegerReply("HDEL", key, field, ...fields);
  }

  hexists(key: string, field: string) {
    return this.execIntegerReply("HEXISTS", key, field);
  }

  hget(key: string, field: string) {
    return this.execBulkReply("HGET", key, field);
  }

  hgetall(key: string) {
    return this.execArrayReply("HGETALL", key) as Promise<BulkString[]>;
  }

  hincrby(key: string, field: string, increment: number) {
    return this.execIntegerReply("HINCRBY", key, field, increment);
  }

  hincrbyfloat(key: string, field: string, increment: number) {
    return this.execBulkReply<BulkString>(
      "HINCRBYFLOAT",
      key,
      field,
      increment,
    );
  }

  hkeys(key: string) {
    return this.execArrayReply<BulkString>("HKEYS", key);
  }

  hlen(key: string) {
    return this.execIntegerReply("HLEN", key);
  }

  hmget(key: string, ...fields: string[]) {
    return this.execArrayReply<BulkString>("HMGET", key, ...fields);
  }

  hmset(key: string, ...field_values: string[]) {
    return this.execStatusReply("HMSET", key, ...field_values);
  }

  hset(key: string, ...args: string[]) {
    return this.execIntegerReply("HSET", key, ...args);
  }

  hsetnx(key: string, field: string, value: string) {
    return this.execIntegerReply("HSETNX", key, field, value);
  }

  hstrlen(key: string, field: string) {
    return this.execIntegerReply("HSTRLEN", key, field);
  }

  hvals(key: string) {
    return this.execArrayReply("HVALS", key) as Promise<BulkString[]>;
  }

  incr(key: string) {
    return this.execIntegerReply("INCR", key);
  }

  incrby(key: string, increment: number) {
    return this.execIntegerReply("INCRBY", key, increment);
  }

  incrbyfloat(key: string, increment: number) {
    return this.execBulkReply("INCRBYFLOAT", key, increment);
  }

  info(section?: string) {
    if (section) {
      return this.execStatusReply("INFO", section);
    } else {
      return this.execStatusReply("INFO");
    }
  }

  keys(pattern: string) {
    return this.execArrayReply<BulkString>("KEYS", pattern);
  }

  lastsave() {
    return this.execIntegerReply("LASTSAVE");
  }

  lindex(key: string, index: number) {
    return this.execBulkReply("LINDEX", key, index);
  }

  linsert(key: string, loc: "BEFORE" | "AFTER", pivot: string, value: string) {
    return this.execIntegerReply("LINSERT", key, loc, pivot, value);
  }

  llen(key: string) {
    return this.execIntegerReply("LLEN", key);
  }

  lpop(key: string) {
    return this.execBulkReply("LPOP", key);
  }

  lpush(key: string, ...values: (string | number)[]) {
    return this.execIntegerReply("LPUSH", key, ...values);
  }

  lpushx(key: string, value: string | number) {
    return this.execIntegerReply("LPUSHX", key, value);
  }

  lrange(key: string, start: number, stop: number) {
    return this.execArrayReply<BulkString>("LRANGE", key, start, stop);
  }

  lrem(key: string, count: number, value: string | number) {
    return this.execIntegerReply("LREM", key, count, value);
  }

  lset(key: string, index: number, value: string | number) {
    return this.execStatusReply("LSET", key, index, value);
  }

  ltrim(key: string, start: number, stop: number) {
    return this.execStatusReply("LTRIM", key, start, stop);
  }

  memory_doctor() {
    return this.execStatusReply("MEMORY", "DOCTOR");
  }

  memory_help() {
    return this.execArrayReply<BulkString>("MEMORY", "HELP");
  }

  memory_malloc_stats() {
    return this.execStatusReply("MEMORY", "MALLOC", "STATS");
  }

  memory_purge() {
    return this.execStatusReply("MEMORY", "PURGE");
  }

  memory_stats() {
    return this.execArrayReply<ConditionalArray>("MEMORY", "STATS");
  }

  memory_usage(
    key: string,
    opts?: {
      samples?: number;
    },
  ) {
    const args: (number | string)[] = [key];
    if (opts && typeof opts.samples === "number") {
      args.push("SAMPLES", opts.samples);
    }
    return this.execIntegerReply("MEMORY", "USAGE", ...args);
  }

  mget(...keys: string[]) {
    return this.execArrayReply<Bulk>("MGET", ...keys);
  }

  migrate(
    host: string,
    port: number | string,
    key: string,
    destination_db: string,
    timeout: number,
    opts?: {
      copy?: boolean;
      replace?: boolean;
      keys?: string[];
    },
  ) {
    const args = [host, port, key, destination_db, timeout];
    if (opts) {
      if (opts.copy) {
        args.push("COPY");
      }
      if (opts.replace) {
        args.push("REPLACE");
      }
      if (opts.keys) {
        args.push("KEYS", ...opts.keys);
      }
    }
    return this.execStatusReply("MIGRATE", ...args);
  }

  module_list() {
    return this.execArrayReply<BulkString>("MODULE", "LIST");
  }

  module_load(path: string, args: string) {
    return this.execStatusReply("MODULE", "LOAD", path, args);
  }

  module_unload(name: string) {
    return this.execStatusReply("MODULE", "UNLOAD", name);
  }

  monitor() {
    throw new Error("not supported yet");
  }

  move(key: string, db: string) {
    return this.execIntegerReply("MOVE", key, db);
  }

  mset(...key_values: string[]) {
    return this.execStatusReply("MSET", ...key_values);
  }

  msetnx(...key_values: string[]) {
    return this.execIntegerReply("MSETNX", ...key_values);
  }

  multi() {
    return this.execStatusReply("MULTI");
  }

  object_encoding(key: string) {
    return this.execBulkReply("OBJECT", "ENCODING", key);
  }

  object_freq(key: string) {
    return this.execIntegerReply("OBJECT", "FREQ", key);
  }

  object_help() {
    return this.execArrayReply<BulkString>("OBJECT", "HELP");
  }

  object_ideltime(key: string) {
    return this.execIntegerReply("OBJECT", "IDLETIME", key);
  }

  object_refcount(key: string) {
    return this.execIntegerReply("OBJECT", "REFCOUNT", key);
  }

  persist(key: string) {
    return this.execIntegerReply("PERSIST", key);
  }

  pexpire(key: string, milliseconds: number) {
    return this.execIntegerReply("PEXPIRE", key, milliseconds);
  }

  pexpireat(key: string, milliseconds_timestamp: number) {
    return this.execIntegerReply("PEXPIREAT", key, milliseconds_timestamp);
  }

  pfadd(key: string, element: string, ...elements: string[]) {
    return this.execIntegerReply("PFADD", key, element, ...elements);
  }

  pfcount(key: string, ...keys: string[]) {
    return this.execIntegerReply("PFCOUNT", key, ...keys);
  }

  pfmerge(destkey: string, ...sourcekeys: string[]) {
    return this.execStatusReply("PFMERGE", destkey, ...sourcekeys);
  }

  ping(message?: string) {
    if (message) {
      return this.execBulkReply<BulkString>("PING", message);
    } else {
      return this.execStatusReply("PING");
    }
  }

  psetex(key: string, milliseconds: number, value: string) {
    return this.execStatusReply("PSETEX", key, milliseconds, value);
  }

  // PubSub

  publish(channel: string, message: string) {
    return this.execIntegerReply("PUBLISH", channel, message);
  }

  subscribe(...channels: string[]) {
    return subscribe(this.connection, ...channels);
  }

  psubscribe(...patterns: string[]) {
    return psubscribe(this.connection, ...patterns);
  }

  pubsub_channels(pattern: string) {
    return this.execArrayReply<BulkString>("PUBSUB", "CHANNELS", pattern);
  }

  pubsub_numpat() {
    return this.execIntegerReply("PUBSUB", "NUMPAT");
  }

  async pubsub_numsubs(...channels: string[]) {
    const arr = await this.execArrayReply<BulkString | Integer>(
      "PUBSUB",
      "NUMSUBS",
      ...channels,
    );
    const ret: [string, number][] = [];
    for (let i = 0; i < arr.length; i += 2) {
      const [chan, num] = [arr[i] as BulkString, arr[i + 1] as Integer];
      ret.push([chan, num]);
    }
    return ret;
  }

  pttl(key: string) {
    return this.execIntegerReply("PTTL", key);
  }

  quit() {
    return this.execStatusReply("QUIT")
      .finally(() => {
        this.connection?.close();
      });
  }

  randomkey() {
    return this.execStatusReply("RANDOMKEY");
  }

  readonly() {
    return this.execStatusReply("READONLY");
  }

  readwrite() {
    return this.execStatusReply("READWRITE");
  }

  rename(key: string, newkey: string) {
    return this.execStatusReply("RENAME", key, newkey);
  }

  renamenx(key: string, newkey: string) {
    return this.execIntegerReply("RENAMENX", key, newkey);
  }

  restore(
    key: string,
    ttl: number,
    serialized_value: string,
    REPLACE?: boolean,
  ) {
    const args = [key, ttl, serialized_value];
    if (REPLACE) {
      args.push("REPLACE");
    }
    return this.execStatusReply("RESTORE", ...args);
  }

  role() {
    return this.execArrayReply("ROLE") as Promise<
      | ["master", Integer, BulkString[][]]
      | ["slave", BulkString, Integer, BulkString, Integer]
      | ["sentinel", BulkString[]]
    >;
  }

  rpop(key: string) {
    return this.execBulkReply("RPOP", key);
  }

  rpoplpush(source: string, destination: string) {
    return this.execBulkReply("RPOPLPUSH", source, destination);
  }

  rpush(key: string, ...values: (string | number)[]) {
    return this.execIntegerReply("RPUSH", key, ...values);
  }

  rpushx(key: string, value: string) {
    return this.execIntegerReply("RPUSHX", key, value);
  }

  sadd(key: string, member: string, ...members: string[]) {
    return this.execIntegerReply("SADD", key, member, ...members);
  }

  save() {
    return this.execStatusReply("SAVE");
  }

  scard(key: string) {
    return this.execIntegerReply("SCARD", key);
  }

  script_debug(arg: "YES" | "SYNC" | "NO") {
    return this.execStatusReply("SCRIPT", "DEBUG", arg);
  }

  script_exists(...sha1s: string[]) {
    return this.execArrayReply<Integer>("SCRIPT", "EXISTS", ...sha1s);
  }

  script_flush() {
    return this.execStatusReply("SCRIPT", "FLUSH");
  }

  script_kill() {
    return this.execStatusReply("SCRIPT", "KILL");
  }

  script_load(script: string) {
    return this.execStatusReply("SCRIPT", "LOAD", script);
  }

  sdiff(...keys: string[]) {
    return this.execArrayReply<BulkString>("SDIFF", ...keys);
  }

  sdiffstore(destination: string, key: string, ...keys: string[]) {
    return this.execIntegerReply("SDIFFSTORE", destination, key, ...keys);
  }

  select(index: number) {
    return this.execStatusReply("SELECT", index);
  }

  set(
    key: string,
    value: string,
    opts?: {
      ex?: number;
      px?: number;
    },
  ): Promise<Status>;
  set(
    key: string,
    value: string,
    opts: {
      ex?: number;
      px?: number;
      mode: "NX" | "XX";
    },
  ): Promise<Status | BulkNil>;
  set(
    key: string,
    value: string,
    opts?: {
      ex?: number;
      px?: number;
      mode?: "NX" | "XX";
    },
  ) {
    const args: (number | string)[] = [key, value];
    if (opts) {
      if (opts.ex) {
        args.push("EX", opts.ex);
      } else if (opts.px) {
        args.push("PX", opts.px);
      }
      if (opts.mode) {
        args.push(opts.mode);
      }
    }
    if (opts?.mode) {
      return this.execStatusOrNilReply("SET", ...args);
    } else {
      return this.execStatusReply("SET", ...args);
    }
  }

  setbit(key: string, offset: number, value: string) {
    return this.execIntegerReply("SETBIT", key, offset, value);
  }

  setex(key: string, seconds: number, value: string) {
    return this.execStatusReply("SETEX", key, seconds, value);
  }

  setnx(key: string, value: string) {
    return this.execIntegerReply("SETNX", key, value);
  }

  setrange(key: string, offset: number, value: string) {
    return this.execIntegerReply("SETRANGE", key, offset, value);
  }

  shutdown(arg: string) {
    return this.execStatusReply("SHUTDOWN", arg);
  }

  sinter(key: string, ...keys: string[]) {
    return this.execArrayReply<BulkString>("SINTER", key, ...keys);
  }

  sinterstore(destination: string, key: string, ...keys: string[]) {
    return this.execIntegerReply("SINTERSTORE", destination, key, ...keys);
  }

  sismember(key: string, member: string) {
    return this.execIntegerReply("SISMEMBER", key, member);
  }

  slaveof(host: string, port: string | number) {
    return this.execStatusReply("SLAVEOF", host, port);
  }

  replicaof(host: string, port: string | number) {
    return this.execStatusReply("REPLICAOF", host, port);
  }

  slowlog(subcommand: string, ...argument: string[]) {
    return this.connection!.exec("SLOWLOG", subcommand, ...argument);
  }

  smembers(key: string) {
    return this.execArrayReply<BulkString>("SMEMBERS", key);
  }

  smove(source: string, destination: string, member: string) {
    return this.execIntegerReply("SMOVE", source, destination, member);
  }

  sort(
    key: string,
    opts?: {
      by?: string;
      offset?: number;
      count?: number;
      patterns?: string[];
      order: "ASC" | "DESC";
      alpha?: boolean;
    },
  ): Promise<BulkString[]>;

  sort(
    key: string,
    opts?: {
      by?: string;
      offset?: number;
      count?: number;
      patterns?: string[];
      order: "ASC" | "DESC";
      alpha?: boolean;
      destination: string;
    },
  ): Promise<Integer>;
  sort(
    key: string,
    opts?: {
      by?: string;
      offset?: number;
      count?: number;
      patterns?: string[];
      order: "ASC" | "DESC";
      alpha?: boolean;
      destination?: string;
    },
  ) {
    const args: (number | string)[] = [key];
    if (opts) {
      if (opts.by) {
        args.push("BY", opts.by);
      }
      if (opts.offset !== void 0 && opts.count !== void 0) {
        args.push("LIMIT", opts.offset, opts.count);
      }
      if (opts.patterns) {
        for (const pat of opts.patterns) {
          args.push("GET", pat);
        }
      }
      if (opts.alpha) {
        args.push("ALPHA");
      }
      if (opts.order) {
        args.push(opts.order);
      }
      if (opts.destination) {
        args.push("STORE", opts.destination);
      }
    }
    if (opts && opts.destination) {
      return this.execIntegerReply("SORT", ...args);
    } else {
      return this.execArrayReply("SORT", ...args);
    }
  }

  spop(key: string): Promise<Bulk>;
  spop(key: string, count: number): Promise<BulkString[]>;
  spop(key: string, count?: number) {
    if (typeof count === "number") {
      return this.execArrayReply<BulkString>("SPOP", key, count);
    } else {
      return this.execBulkReply("SPOP", key);
    }
  }

  srandmember(key: string): Promise<Bulk>;
  srandmember(key: string, count: number): Promise<BulkString[]>;
  srandmember(key: string, count?: number) {
    if (count != null) {
      return this.execArrayReply<BulkString>("SRANDMEMBER", key, count);
    } else {
      return this.execBulkReply("SRANDMEMBER", key);
    }
  }

  srem(key: string, ...members: string[]) {
    return this.execIntegerReply("SREM", key, ...members);
  }

  strlen(key: string) {
    return this.execIntegerReply("STRLEN", key);
  }

  sunion(...keys: string[]) {
    return this.execArrayReply<BulkString>("SUNION", ...keys);
  }

  sunionstore(destination: string, ...keys: string[]) {
    return this.execIntegerReply("SUNIONSTORE", destination, ...keys);
  }

  swapdb(index: number, index2: number) {
    return this.execStatusReply("SWAPDB", index, index2);
  }

  sync() {
    throw new Error("not implemented");
  }

  time() {
    return this.execArrayReply("TIME") as Promise<[BulkString, BulkString]>;
  }

  touch(...keys: string[]) {
    return this.execIntegerReply("TOUCH", ...keys);
  }

  ttl(key: string) {
    return this.execIntegerReply("TTL", key);
  }

  type(key: string) {
    return this.execStatusReply("TYPE", key);
  }

  unlink(...keys: string[]) {
    return this.execIntegerReply("UNLINK", ...keys);
  }

  unwatch() {
    return this.execStatusReply("UNWATCH");
  }

  wait(numreplicas: number, timeout: number) {
    return this.execIntegerReply("WAIT", numreplicas, timeout);
  }

  watch(key: string, ...keys: string[]) {
    return this.execStatusReply("WATCH", key, ...keys);
  }

  xack(key: string, group: string, ...xids: XIdInput[]) {
    return this.execIntegerReply(
      "XACK",
      key,
      group,
      ...xids.map((xid) => xidstr(xid)),
    );
  }

  xadd(
    key: string,
    xid: XIdAdd,
    field_values: XAddFieldValues,
    maxlen: XMaxlen | undefined = undefined,
  ) {
    const args: (string | number)[] = [key];

    if (maxlen) {
      args.push("MAXLEN");
      if (maxlen.approx) {
        args.push("~");
      }
      args.push(maxlen.elements.toString());
    }

    args.push(xidstr(xid));

    if (field_values instanceof Map) {
      for (const [f, v] of field_values) {
        args.push(f);
        args.push(v);
      }
    } else {
      for (const [f, v] of Object.entries(field_values)) {
        args.push(f);
        args.push(v);
      }
    }

    return this.execBulkReply<BulkString>(
      "XADD",
      ...args,
    ).then((rawId) => parseXId(rawId));
  }

  xclaim(key: string, opts: XClaimOpts, ...xids: XIdInput[]) {
    const args = [];
    if (opts.idle) {
      args.push("IDLE");
      args.push(opts.idle);
    }

    if (opts.time) {
      args.push("TIME");
      args.push(opts.time);
    }

    if (opts.retryCount) {
      args.push("RETRYCOUNT");
      args.push(opts.retryCount);
    }

    if (opts.force) {
      args.push("FORCE");
    }

    if (opts.justXId) {
      args.push("JUSTID");
    }

    return this.execArrayReply<XReadIdData | BulkString>(
      "XCLAIM",
      key,
      opts.group,
      opts.consumer,
      opts.minIdleTime,
      ...xids.map((xid) => xidstr(xid)),
      ...args,
    ).then((raw) => {
      if (opts.justXId) {
        const xids = [];
        for (const r of raw) {
          if (typeof r === "string") {
            xids.push(parseXId(r));
          }
        }
        const payload: XClaimJustXId = { kind: "justxid", xids };
        return payload;
      }

      const messages = [];
      for (const r of raw) {
        if (typeof r !== "string") {
          messages.push(parseXMessage(r));
        }
      }
      const payload: XClaimMessages = { kind: "messages", messages };
      return payload;
    });
  }

  xdel(key: string, ...xids: XIdInput[]) {
    return this.execIntegerReply(
      "XDEL",
      key,
      ...xids.map((rawId) => xidstr(rawId)),
    );
  }

  xlen(key: string) {
    return this.execIntegerReply("XLEN", key);
  }

  xgroup_create(
    key: string,
    groupName: string,
    xid: XIdInput | "$",
    mkstream?: boolean,
  ) {
    const args = [];
    if (mkstream) {
      args.push("MKSTREAM");
    }

    return this.execStatusReply(
      "XGROUP",
      "CREATE",
      key,
      groupName,
      xidstr(xid),
      ...args,
    );
  }

  xgroup_delconsumer(
    key: string,
    groupName: string,
    consumerName: string,
  ) {
    return this.execIntegerReply(
      "XGROUP",
      "DELCONSUMER",
      key,
      groupName,
      consumerName,
    );
  }

  xgroup_destroy(key: string, groupName: string) {
    return this.execIntegerReply("XGROUP", "DESTROY", key, groupName);
  }

  xgroup_help() {
    return this.execBulkReply<BulkString>("XGROUP", "HELP");
  }

  xgroup_setid(
    key: string,
    groupName: string,
    xid: XId,
  ) {
    return this.execStatusReply(
      "XGROUP",
      "SETID",
      key,
      groupName,
      xidstr(xid),
    );
  }

  xinfo_stream(key: string) {
    return this.execArrayReply<Raw>("XINFO", "STREAM", key).then(
      (raw) => {
        // Note that you should not rely on the fields
        // exact position, nor on the number of fields,
        // new fields may be added in the future.
        const data: Map<string, Raw> = convertMap(raw);

        const firstEntry = parseXMessage(
          data.get("first-entry") as XReadIdData,
        );
        const lastEntry = parseXMessage(
          data.get("last-entry") as XReadIdData,
        );

        return {
          length: rawnum(data.get("length")),
          radixTreeKeys: rawnum(data.get("radix-tree-keys")),
          radixTreeNodes: rawnum(data.get("radix-tree-nodes")),
          groups: rawnum(data.get("groups")),
          lastGeneratedId: parseXId(rawstr(data.get("last-generated-id"))),
          firstEntry,
          lastEntry,
        };
      },
    );
  }

  xinfo_stream_full(key: string, count?: number) {
    const args = [];
    if (count) {
      args.push("COUNT");
      args.push(count);
    }
    return this.execArrayReply<Raw>("XINFO", "STREAM", key, "FULL", ...args)
      .then(
        (raw) => {
          // Note that you should not rely on the fields
          // exact position, nor on the number of fields,
          // new fields may be added in the future.
          if (raw === undefined) throw "no data";

          const data: Map<string, Raw> = convertMap(raw);
          if (data === undefined) throw "no data converted";

          const entries = (data.get("entries") as ConditionalArray).map((raw) =>
            parseXMessage(raw as XReadIdData)
          );
          return {
            length: rawnum(data.get("length")),
            radixTreeKeys: rawnum(data.get("radix-tree-keys")),
            radixTreeNodes: rawnum(data.get("radix-tree-nodes")),
            lastGeneratedId: parseXId(rawstr(data.get("last-generated-id"))),
            entries,
            groups: parseXGroupDetail(data.get("groups") as ConditionalArray),
          };
        },
      );
  }

  xinfo_groups(key: string) {
    return this.execArrayReply<ConditionalArray>("XINFO", "GROUPS", key).then(
      (raws) =>
        raws.map((raw) => {
          const data = convertMap(raw);
          return {
            name: rawstr(data.get("name")),
            consumers: rawnum(data.get("consumers")),
            pending: rawnum(data.get("pending")),
            lastDeliveredId: parseXId(rawstr(data.get("last-delivered-id"))),
          };
        }),
    );
  }

  xinfo_consumers(key: string, group: string) {
    return this.execArrayReply<ConditionalArray>(
      "XINFO",
      "CONSUMERS",
      key,
      group,
    ).then(
      (raws) =>
        raws.map((raw) => {
          const data = convertMap(raw);
          return {
            name: rawstr(data.get("name")),
            pending: rawnum(data.get("pending")),
            idle: rawnum(data.get("idle")),
          };
        }),
    );
  }

  xpending(
    key: string,
    group: string,
  ) {
    return this.execArrayReply<Raw>("XPENDING", key, group)
      .then((raw) => {
        if (
          isNumber(raw[0]) && isString(raw[1]) &&
          isString(raw[2]) && isCondArray(raw[3])
        ) {
          return {
            count: raw[0],
            startId: parseXId(raw[1]),
            endId: parseXId(raw[2]),
            consumers: parseXPendingConsumers(raw[3]),
          };
        } else {
          throw "parse err";
        }
      });
  }

  xpending_count(
    key: string,
    group: string,
    startEndCount: StartEndCount,
    consumer?: string,
  ) {
    const args = [];
    args.push(startEndCount.start);
    args.push(startEndCount.end);
    args.push(startEndCount.count);

    if (consumer) {
      args.push(consumer);
    }

    return this.execArrayReply<Raw>("XPENDING", key, group, ...args)
      .then((raw) => parseXPendingCounts(raw));
  }

  xrange(
    key: string,
    start: XIdNeg,
    end: XIdPos,
    count?: number,
  ) {
    const args: (string | number)[] = [key, xidstr(start), xidstr(end)];
    if (count) {
      args.push("COUNT");
      args.push(count);
    }
    return this.execArrayReply<XReadIdData>("XRANGE", ...args).then(
      (raw) => raw.map((m) => parseXMessage(m)),
    );
  }

  xrevrange(
    key: string,
    start: XIdPos,
    end: XIdNeg,
    count?: number,
  ) {
    const args: (string | number)[] = [key, xidstr(start), xidstr(end)];
    if (count) {
      args.push("COUNT");
      args.push(count);
    }
    return this.execArrayReply<XReadIdData>("XREVRANGE", ...args).then(
      (raw) => raw.map((m) => parseXMessage(m)),
    );
  }

  xread(
    key_xids: (XKeyId | XKeyIdLike)[],
    opts?: { count?: number; block?: number },
  ) {
    const args = [];
    if (opts) {
      if (opts.count) {
        args.push("COUNT");
        args.push(opts.count);
      }
      if (opts.block) {
        args.push("BLOCK");
        args.push(opts.block);
      }
    }
    args.push("STREAMS");

    const the_keys = [];
    const the_xids = [];

    for (const a of key_xids) {
      if (a instanceof Array) {
        // XKeyIdLike
        the_keys.push(a[0]);
        the_xids.push(xidstr(a[1]));
      } else {
        // XKeyId
        the_keys.push(a.key);
        the_xids.push(xidstr(a.xid));
      }
    }

    return this.execArrayReply<XReadStreamRaw>(
      "XREAD",
      ...args.concat(the_keys).concat(the_xids),
    ).then((raw) => parseXReadReply(raw));
  }

  xreadgroup(
    key_xids: (XKeyIdGroup | XKeyIdGroupLike)[],
    { group, consumer, count, block }: XReadGroupOpts,
  ) {
    const args: (string | number)[] = [
      "GROUP",
      group,
      consumer,
    ];

    if (count) {
      args.push("COUNT");
      args.push(count);
    }
    if (block) {
      args.push("BLOCK");
      args.push(block);
    }

    args.push("STREAMS");

    const the_keys = [];
    const the_xids = [];

    for (const a of key_xids) {
      if (a instanceof Array) {
        // XKeyIdGroupLike
        the_keys.push(a[0]);
        the_xids.push(a[1] === ">" ? ">" : xidstr(a[1]));
      } else {
        // XKeyIdGroup
        the_keys.push(a.key);
        the_xids.push(a.xid === ">" ? ">" : xidstr(a.xid));
      }
    }

    return this.execArrayReply<XReadStreamRaw>(
      "XREADGROUP",
      ...args.concat(the_keys).concat(the_xids),
    ).then((raw) => parseXReadReply(raw));
  }

  xtrim(key: string, maxlen: XMaxlen) {
    const args = [];
    if (maxlen.approx) {
      args.push("~");
    }

    args.push(maxlen.elements);

    return this.execIntegerReply("XTRIM", key, "MAXLEN", ...args);
  }

  // deno-lint-ignore no-explicit-any
  zadd(key: string, scoreOrArr: any, memberOrOpts: any, opts?: any) {
    const args: (string | number)[] = [key];
    let _opts = opts;
    if (typeof scoreOrArr === "number") {
      args.push(scoreOrArr);
      args.push(memberOrOpts);
    } else if (Array.isArray(scoreOrArr)) {
      for (const [s, m] of scoreOrArr) {
        args.push(s, m);
      }
      _opts = memberOrOpts;
    }
    if (_opts) {
      if (_opts.nxx) {
        args.push(_opts.nxx);
      }
      if (_opts.ch) {
        args.push("CH");
      }
      if (_opts.incr) {
        args.push("INCR");
      }
    }
    return this.execIntegerReply("ZADD", ...args);
  }

  zcard(key: string) {
    return this.execIntegerReply("ZCARD", key);
  }

  zcount(key: string, min: number, max: number) {
    return this.execIntegerReply("ZCOUNT", key, min, max);
  }

  zincrby(key: string, increment: number, member: string) {
    return this.execBulkReply<BulkString>("ZINCRBY", key, increment, member);
  }

  zinterstore(
    destination: string,
    numkeys: number,
    keys: string[],
    weights?: number | number[],
    aggregate?: string,
  ) {
    const args = this.pushZInterStoreArgs(
      [destination, numkeys],
      keys,
      weights,
      aggregate,
    );
    return this.execIntegerReply("ZINTERSTORE", ...args);
  }

  zunionstore(
    destination: string,
    keys: string[],
    opts?: {
      weights?: number[];
      aggregate?: "SUM" | "MIN" | "MAX";
    },
  ) {
    const args: (string | number)[] = [destination, keys.length, ...keys];
    if (opts) {
      if (opts.weights) {
        args.push("WEIGHTS", ...opts.weights);
      }
      if (opts.aggregate) {
        args.push("AGGREGATE", opts.aggregate);
      }
    }
    return this.execIntegerReply("ZUNIONSTORE", ...args);
  }

  private pushZInterStoreArgs(
    args: (number | string)[],
    keys: string | string[],
    weights?: number | number[],
    aggregate?: string,
  ) {
    if (typeof keys === "string") {
      args.push(keys);
    } else {
      args.push(...keys);
    }
    if (weights) {
      args.push("WEIGHTS");
      if (typeof weights === "number") {
        args.push(weights);
      } else {
        args.push(...weights);
      }
    }
    if (aggregate) {
      args.push("AGGREGATE");
      args.push(aggregate);
    }
    return args;
  }

  zlexcount(key: string, min: string, max: string) {
    return this.execIntegerReply("ZLEXCOUNT", key, min, max);
  }

  zpopmax(key: string, count?: number) {
    if (count != null) {
      return this.execArrayReply<BulkString>("ZPOPMAX", key, count);
    } else {
      return this.execArrayReply<BulkString>("ZPOPMAX", key);
    }
  }

  zpopmin(key: string, count?: number) {
    if (count != null) {
      return this.execArrayReply<BulkString>("ZPOPMIN", key, count);
    } else {
      return this.execArrayReply<BulkString>("ZPOPMIN", key);
    }
  }

  zrange(
    key: string,
    start: number,
    stop: number,
    opts?: {
      withScore?: boolean;
    },
  ) {
    const args = this.pushZrangeOpts([key, start, stop], opts);
    return this.execArrayReply<BulkString>("ZRANGE", ...args);
  }

  zrangebylex(
    key: string,
    min: string,
    max: string,
    opts?: {
      withScore?: boolean;
      count?: number;
    },
  ) {
    const args = this.pushZrangeOpts([key, min, max], opts);
    return this.execArrayReply<BulkString>("ZRANGEBYLEX", ...args);
  }

  zrevrangebylex(
    key: string,
    max: string,
    min: string,
    opts?: {
      withScore?: boolean;
      count?: number;
    },
  ) {
    const args = this.pushZrangeOpts([key, min, max], opts);
    return this.execArrayReply<BulkString>("ZREVRANGEBYLEX", ...args);
  }

  zrangebyscore(
    key: string,
    min: string,
    max: string,
    opts?: {
      withScore?: boolean;
      count?: number;
    },
  ) {
    const args = this.pushZrangeOpts([key, min, max], opts);
    return this.execArrayReply<BulkString>("ZRANGEBYSCORE", ...args);
  }

  private pushZrangeOpts(
    args: (number | string)[],
    opts?: {
      withScore?: boolean;
      offset?: number;
      count?: number;
    },
  ) {
    if (opts) {
      if (opts.withScore) {
        args.push("WITHSCORES");
      }
      if (opts.offset !== void 0 && opts.count !== void 0) {
        args.push("LIMIT", opts.offset, opts.count);
      }
    }
    return args;
  }

  zrank(key: string, member: string) {
    return this.execIntegerReply("ZRANK", key, member);
  }

  zrem(key: string, ...members: string[]) {
    return this.execIntegerReply("ZREM", key, ...members);
  }

  zremrangebylex(key: string, min: string, max: string) {
    return this.execIntegerReply("ZREMRANGEBYLEX", key, min, max);
  }

  zremrangebyrank(key: string, start: number, stop: number) {
    return this.execIntegerReply("ZREMRANGEBYRANK", key, start, stop);
  }

  zremrangebyscore(key: string, min: number, max: number) {
    return this.execIntegerReply("ZREMRANGEBYSCORE", key, min, max);
  }

  zrevrange(
    key: string,
    start: number,
    stop: number,
    opts?: {
      withScore?: boolean;
    },
  ) {
    const args = this.pushZrangeOpts([key, start, stop], opts);
    return this.execArrayReply<BulkString>("ZREVRANGE", ...args);
  }

  zrevrangebyscore(
    key: string,
    max: number,
    min: number,
    opts?: {
      withScore?: boolean;
      offset?: number;
      count?: number;
    },
  ) {
    const args = this.pushZrangeOpts([key, max, min], opts);
    return this.execArrayReply<BulkString>("ZREVRANGEBYSCORE", ...args);
  }

  zrevrank(key: string, member: string) {
    return this.execIntegerReply("ZREVRANK", key, member);
  }

  zscore(key: string, member: string) {
    return this.execBulkReply("ZSCORE", key, member);
  }

  scan(
    cursor: number,
    opts?: {
      pattern?: string;
      count?: number;
    },
  ) {
    const arg = this.pushScanOpts([cursor], opts);
    return this.execArrayReply("SCAN", ...arg) as Promise<
      [BulkString, BulkString[]]
    >;
  }

  sscan(
    key: string,
    cursor: number,
    opts?: {
      pattern?: string;
      count?: number;
    },
  ) {
    const arg = this.pushScanOpts([key, cursor], opts);
    return this.execArrayReply("SSCAN", ...arg) as Promise<
      [BulkString, BulkString[]]
    >;
  }

  hscan(
    key: string,
    cursor: number,
    opts?: {
      pattern?: string;
      count?: number;
    },
  ) {
    const arg = this.pushScanOpts([key, cursor], opts);
    return this.execArrayReply("HSCAN", ...arg) as Promise<
      [BulkString, BulkString[]]
    >;
  }

  zscan(
    key: string,
    cursor: number,
    opts?: {
      pattern?: string;
    },
  ) {
    const arg = this.pushScanOpts([key, cursor], opts);
    return this.execArrayReply("ZSCAN", ...arg) as Promise<
      [BulkString, BulkString[]]
    >;
  }

  private pushScanOpts(
    arg: (number | string)[],
    opts?: {
      pattern?: string;
      count?: number;
    },
  ) {
    if (opts) {
      if (opts.pattern) {
        arg.push("MATCH", opts.pattern);
      }
      if (opts.count !== void 0) {
        arg.push("COUNT", opts.count);
      }
    }
    return arg;
  }

  // pipeline
  tx() {
    return createRedisPipeline(this.connection, { tx: true });
  }

  pipeline() {
    return createRedisPipeline(this.connection);
  }
}

export type RedisConnectOptions = {
  hostname: string;
  port?: number | string;
  tls?: boolean;
  db?: number;
  password?: string;
  name?: string;
  maxRetryCount?: number;
};

type RedisConnectionOptions = {
  hostname?: string;
  port?: number | string;
  tls?: boolean;
  db?: number;
  password?: string;
  name?: string;
  maxRetryCount?: number;
};

class RedisConnection implements Connection<RedisRawReply> {
  name: string | null = null;
  closer!: Closer;
  reader!: BufReader;
  writer!: BufWriter;

  executor!: CommandExecutor<RedisRawReply>;

  get exec(): CommandFunc<RedisRawReply> {
    return this.executor!.exec;
  }

  private _isConnected = false;

  get isConnected(): boolean {
    return this._isConnected;
  }

  private _isClosed = false;

  get isClosed(): boolean {
    return this._isClosed;
  }

  maxRetryCount = 0;
  private retryCount = 0;

  private connectThunkified: () => Promise<RedisConnection>;
  private thunkifyConnect(
    hostname: string,
    port: string | number,
    options: RedisConnectionOptions,
  ): () => Promise<RedisConnection> {
    return async () => {
      const dialOpts: Deno.ConnectOptions = {
        hostname,
        port: parsePortLike(port),
      };
      if (!Number.isSafeInteger(dialOpts.port)) {
        throw new Error("deno-redis: opts.port is invalid");
      }
      const conn: Deno.Conn = options?.tls
        ? await Deno.connectTls(dialOpts)
        : await Deno.connect(dialOpts);

      if (options.name) this.name = options.name;
      if (options.maxRetryCount) this.maxRetryCount = options.maxRetryCount;

      this.closer = conn;
      this.reader = new BufReader(conn);
      this.writer = new BufWriter(conn);
      this.executor = muxExecutor(this, this.maxRetryCount > 0);

      this._isClosed = false;
      this._isConnected = true;

      try {
        if (options?.password != null) {
          await this.authenticate(options.password);
        }
        if (options?.db) await this.selectDb(options.db);
      } catch (error) {
        this.close();
        throw error;
      }

      return this as RedisConnection;
    };
  }

  constructor(
    hostname: string,
    port: number | string,
    private options: RedisConnectionOptions,
  ) {
    this.connectThunkified = this.thunkifyConnect(hostname, port, options);
  }

  private authenticate(
    password: string,
  ): Promise<RedisRawReply> {
    const readerAsBuffer = this.reader as BufReader;
    const writerAsBuffer = this.writer as BufWriter;

    return sendCommand(writerAsBuffer, readerAsBuffer, "AUTH", password);
  }

  private selectDb(
    databaseIndex: number | undefined = this.options.db,
  ): Promise<RedisRawReply> {
    if (!databaseIndex) throw new Error("The database index is undefined.");

    const readerAsBuffer = this.reader as BufReader;
    const writerAsBuffer = this.writer as BufWriter;

    return sendCommand(writerAsBuffer, readerAsBuffer, "SELECT", databaseIndex);
  }

  close() {
    this._isClosed = true;
    this._isConnected = false;
    try {
      this.closer!.close();
    } catch (error) {
      if (!(error instanceof Deno.errors.BadResource)) throw error;
    }
  }

  /**
   * Connect to Redis server
   */
  async connect(): Promise<void> {
    await this.connectThunkified();
  }

  async reconnect(): Promise<void> {
    const readerAsBuffer = this.reader as BufReader;
    const writerAsBuffer = this.writer as BufWriter;
    if (!readerAsBuffer.peek(1)) throw new Error("Client is closed.");

    try {
      await sendCommand(writerAsBuffer, readerAsBuffer, "PING");
      this._isConnected = true;
    } catch (error) {
      this._isConnected = false;
      return new Promise(
        (resolve, reject) => {
          const interval = setInterval(
            async () => {
              if (this.retryCount > this.maxRetryCount) {
                await this.close();
                clearInterval(interval);
                reject(new Error("Could not reconnect"));
              }

              try {
                await this.close();
                await this.connect();

                await sendCommand(
                  this.writer as BufWriter,
                  this.reader as BufReader,
                  "PING",
                );

                this._isConnected = true;
                this.retryCount = 0;
                clearInterval(interval);
                resolve();
              } catch (err) {
                // retrying
              } finally {
                this.retryCount++;
              }
            },
            1200, // TODO parameterize this.
          );
        },
      );
    }
  }
}

function parsePortLike(port: string | number | undefined): number {
  if (typeof port === "string") {
    return parseInt(port);
  } else if (typeof port === "number") {
    return port;
  } else if (port === undefined) {
    return 6379;
  } else {
    throw new Error("port is invalid: typeof=" + typeof port);
  }
}

/**
 * Connect to Redis server
 * @param opts redis server's url http/https url with port number
 * Examples:
 *  const conn = connect({hostname: "127.0.0.1", port: 6379})// -> tcp, 127.0.0.1:6379
 *  const conn = connect({hostname: "redis.proxy", port: 443, tls: true}) // -> TLS, redis.proxy:443
 */
export async function connect({
  hostname,
  port = 6379,
  tls,
  db,
  password,
  name,
  maxRetryCount,
}: RedisConnectOptions): Promise<Redis> {
  const connection = new RedisConnection(
    hostname,
    port,
    { tls, db, maxRetryCount, name, password },
  );

  await connection.connect();
  return new RedisImpl(connection);
}

export function create(
  closer: Closer,
  writer: Writer,
  reader: Reader,
  executor: CommandExecutor<RedisRawReply>,
): Redis {
  return new RedisImpl({
    maxRetryCount: 0,
    closer,
    executor,
    reader: BufReader.create(reader),
    writer: BufWriter.create(writer),
    get exec(): CommandFunc<RedisRawReply> {
      return executor.exec;
    },
    get isConnected(): boolean {
      return true;
    },
    get isClosed(): boolean {
      return false;
    },
    close() {
      closer.close();
    },
    async connect() {
      throw new Error("not implemented");
    },
    async reconnect() {
      throw new Error("not implemented");
    },
  });
}
