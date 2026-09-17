/**
 * QuickJS WASM - A snapshotable JavaScript runtime via WebAssembly.
 *
 * Provides a clean JavaScript API for running sandboxed JS code in a QuickJS
 * VM compiled to WASM. The key differentiator is the ability to snapshot the
 * entire VM state (including pending promises) and restore it in a fresh
 * WASM instance.
 */
var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import { createWasiShim } from './wasi-shim.js';
import { loadExtension, initExtension, restoreExtensions, } from './extensions.js';
import { VERSION } from './version.js';
/**
 * Flags for `evalCode()`, matching the QuickJS `JS_EVAL_*` constants.
 */
export const EvalFlags = {
    /** Global script mode (default). */
    TYPE_GLOBAL: 0,
    /** Module mode. */
    TYPE_MODULE: (1 << 0),
    /** Force strict mode. */
    STRICT: (1 << 3),
    /** Compile only — do not execute. */
    COMPILE_ONLY: (1 << 5),
    /** Omit stack frames before this eval from Error backtraces. */
    BACKTRACE_BARRIER: (1 << 6),
    /**
     * Allow top-level `await` in global scripts. When used, `evalCode()`
     * returns a handle to a Promise that resolves to the completion value.
     * Use together with `executePendingJobs()` and `resolvePromise()`.
     */
    ASYNC: (1 << 7),
};
/**
 * Flags for `vm.compile()` controlling what is included in the bytecode output.
 * These can be combined with bitwise OR.
 */
export const CompileFlags = {
    /** Strip source code from the bytecode (smaller output, no source in errors). */
    STRIP_SOURCE: (1 << 4),
    /** Strip debug information (line numbers, etc.) from the bytecode. */
    STRIP_DEBUG: (1 << 5),
};
/**
 * Intrinsic flags for `QuickJSOptions.intrinsics` controlling which
 * built-in JavaScript features are available in the VM.
 *
 * By default all intrinsics are enabled. Pass a bitmask of these flags
 * to create a minimal context — for example, omit `Intrinsics.EVAL` to
 * prevent `eval()` usage, or omit `Intrinsics.PROXY` to disallow `Proxy`.
 *
 * `BaseObjects` (Object, Array, Number, String, Boolean, Error, etc.)
 * is always included and cannot be disabled.
 */
export const Intrinsics = {
    /** `Date` constructor and prototype methods. */
    DATE: (1 << 0),
    /** `eval()` and `Function()` constructor. */
    EVAL: (1 << 1),
    /** `RegExp` constructor, prototype methods, and regex literals. */
    REGEXP: (1 << 2),
    /** `JSON.parse()` and `JSON.stringify()`. */
    JSON: (1 << 3),
    /** `Proxy` and `Reflect`. */
    PROXY: (1 << 4),
    /** `Map`, `Set`, `WeakMap`, `WeakSet`. */
    MAP_SET: (1 << 5),
    /** `ArrayBuffer`, `TypedArray` variants, `DataView`. */
    TYPED_ARRAYS: (1 << 6),
    /** `Promise`, `async`/`await`. */
    PROMISE: (1 << 7),
    /** `BigInt`. Note: BigInt is part of BaseObjects in quickjs-ng and cannot be fully removed. */
    BIG_INT: (1 << 8),
    /** `WeakRef` and `FinalizationRegistry`. */
    WEAK_REF: (1 << 9),
    /** `performance.now()`. */
    PERFORMANCE: (1 << 10),
    /** `DOMException` class. */
    DOM_EXCEPTION: (1 << 11),
    /** All intrinsics enabled (default). */
    ALL: 0xFFFFFFFF,
};
// ---- Snapshot serialization ----
/** Magic bytes: "QJSS" (QuickJS Snapshot) */
const SNAPSHOT_MAGIC = 0x514A5353;
/** Current serialization format version (2 = added extension metadata) */
const SNAPSHOT_VERSION = 2;
/**
 * Header layout (version 2):
 *   0-3:   Magic "QJSS" (u32 big-endian)
 *   4:     Version (u8)
 *   5-7:   Reserved (zero)
 *   8-11:  Memory size in bytes (u32 little-endian)
 *   12-15: Stack pointer (u32 little-endian)
 *   16-19: Runtime pointer (u32 little-endian)
 *   20-23: Context pointer (u32 little-endian)
 *   24-27: Extension count (u32 little-endian)
 *   28+:   Extension entries (variable length):
 *          nameLen(u32) + name(utf8) + memoryBase(u32) + tableBase(u32) + initFnLen(u32) + initFn(utf8)
 *   N+:    Memory data (N = memory size from offset 8)
 *
 * Version 1 (legacy): no extension metadata, memory starts at offset 24.
 */
const SNAPSHOT_HEADER_SIZE = 24;
// ---- QuickJS VM ----
export class QuickJS {
    exports;
    module;
    instance;
    encoder = new TextEncoder();
    decoder = new TextDecoder();
    disposed = false;
    /** Registry of host callbacks, keyed by function name */
    hostCallbacks = new Map();
    /** Counter for internal-only callbacks (e.g. promise settle handlers) */
    nextInternalId = 1;
    interruptHandler = null;
    unhandledRejectionHandler = null;
    moduleNormalizeHandler = null;
    moduleLoadHandler = null;
    timezoneOffsetHandler = null;
    // Cached singleton handles
    _global = null;
    _versions = null;
    _undefined = null;
    _null = null;
    _true = null;
    _false = null;
    // Handles that must be freed on dispose (e.g. unresolved promise resolve/reject functions)
    _ownedHandles = new Set();
    /** Loaded extensions in deterministic order */
    loadedExtensions = [];
    constructor(module) {
        this.module = module;
        this.instance = null;
        this.exports = null;
    }
    setInstance(instance) {
        this.instance = instance;
        this.exports = instance.exports;
    }
    // ---- Cached property accessors ----
    /**
     * Version information for the runtime and loaded native libraries.
     * Always includes `"quickjs-wasi"` (the npm package version) and
     * `"quickjs"` (the QuickJS engine version). Extensions may contribute
     * additional entries for their native dependencies (e.g. `"ada"`, `"mbedtls"`).
     */
    get versions() {
        this.assertNotDisposed();
        if (!this._versions) {
            const result = {
                'quickjs-wasi': VERSION,
                quickjs: this.readCString(this.exports.qjs_get_quickjs_version()),
            };
            for (const ext of this.loadedExtensions) {
                if (ext.versions) {
                    Object.assign(result, ext.versions);
                }
            }
            this._versions = result;
        }
        return this._versions;
    }
    /** The global object. Cached — do not dispose. */
    get global() {
        if (!this._global) {
            this._global = new JSValueHandle(this, this.exports.qjs_get_global());
        }
        return this._global;
    }
    /** The undefined value. Cached — do not dispose. */
    get undefined() {
        if (!this._undefined) {
            this._undefined = new JSValueHandle(this, this.exports.qjs_get_undefined());
        }
        return this._undefined;
    }
    /** The null value. Cached — do not dispose. */
    get null() {
        if (!this._null) {
            this._null = new JSValueHandle(this, this.exports.qjs_get_null());
        }
        return this._null;
    }
    /** The true value. Cached — do not dispose. */
    get true() {
        if (!this._true) {
            this._true = new JSValueHandle(this, this.exports.qjs_get_true());
        }
        return this._true;
    }
    /** The false value. Cached — do not dispose. */
    get false() {
        if (!this._false) {
            this._false = new JSValueHandle(this, this.exports.qjs_get_false());
        }
        return this._false;
    }
    /**
     * Create a fresh QuickJS VM instance.
     *
     * @param options - Optional configuration. Can also pass raw WASM bytes
     *                  directly for backwards compatibility.
     */
    static async create(options) {
        const opts = QuickJS.normalizeOptions(options);
        const module = await QuickJS.resolveModule(opts.wasm);
        const vm = new QuickJS(module);
        const { instance, wasiBuiltins, wasiUserOverrides, memoryProxy } = await QuickJS.instantiate(module, vm, opts.wasi);
        vm.setInstance(instance);
        // Initialize the WASI reactor
        vm.exports._initialize();
        // Initialize QuickJS runtime and context
        const result = opts.intrinsics !== undefined
            ? vm.exports.qjs_init2(opts.intrinsics)
            : vm.exports.qjs_init();
        if (result !== 0) {
            throw new Error('Failed to initialize QuickJS runtime');
        }
        // Load and initialize extensions
        if (opts.extensions) {
            const mainExports = instance.exports;
            for (const desc of opts.extensions) {
                const ext = await loadExtension(desc, mainExports, wasiBuiltins, wasiUserOverrides, memoryProxy);
                vm.loadedExtensions.push(ext);
                initExtension(ext, mainExports);
            }
        }
        // Apply runtime limits
        QuickJS.applyLimits(vm, opts);
        return vm;
    }
    /**
     * Restore a QuickJS VM from a snapshot.
     *
     * @param snapshot - The snapshot to restore from.
     * @param options - Optional configuration. Can also pass raw WASM bytes
     *                  directly for backwards compatibility.
     */
    static async restore(snapshot, options) {
        const opts = QuickJS.normalizeOptions(options);
        const module = await QuickJS.resolveModule(opts.wasm);
        const vm = new QuickJS(module);
        const { instance, wasiBuiltins, wasiUserOverrides, memoryProxy } = await QuickJS.instantiate(module, vm, opts.wasi);
        vm.setInstance(instance);
        const mainExports = instance.exports;
        const exportedMemory = vm.exports.memory;
        // Grow memory FIRST — extensions need the memory to be large enough
        // for their __memory_base offsets (which were allocated in the original
        // larger memory during create()).
        const currentPages = exportedMemory.buffer.byteLength / 65536;
        const neededPages = Math.ceil(snapshot.memory.byteLength / 65536);
        if (neededPages > currentPages) {
            exportedMemory.grow(neededPages - currentPages);
        }
        // Re-instantiate extensions BEFORE overwriting memory.
        // This populates the indirect function table with the extension's
        // function pointers (via elem segments and __wasm_apply_data_relocs).
        // We use the exact same memory/table bases from the snapshot so that
        // function table indices match what the snapshotted QuickJS state expects.
        if (snapshot.extensions.length > 0) {
            const descriptors = opts.extensions ?? [];
            vm.loadedExtensions = await restoreExtensions(descriptors, snapshot.extensions, mainExports, wasiBuiltins, wasiUserOverrides, memoryProxy);
        }
        // Copy snapshot data into the module's own memory.
        // This overwrites EVERYTHING — including the regions that extensions
        // just initialized. That's correct because the snapshot already contains
        // the complete state including extension data.
        const dst = new Uint8Array(exportedMemory.buffer);
        dst.set(snapshot.memory);
        // Set runtime/context pointers (they already exist in the restored memory)
        vm.exports.qjs_set_runtime_and_context(snapshot.runtimePtr, snapshot.contextPtr);
        // Restore the stack pointer
        vm.exports.__stack_pointer.value = snapshot.stackPointer;
        // Apply runtime limits
        QuickJS.applyLimits(vm, opts);
        return vm;
    }
    // ---- Snapshot serialization ----
    /**
     * Serialize a snapshot to a binary buffer for persistent storage.
     *
     * The format includes a versioned header followed by the raw memory.
     * Apply your own compression (gzip, zstd, etc.) on top for smaller
     * storage — the memory compresses very well due to large zero regions.
     *
     * Format (version 1):
     * ```
     * Offset  Size  Field
     * 0       4     Magic: "QJSS" (0x514A5353, big-endian)
     * 4       1     Version: 1
     * 5       3     Reserved (zero)
     * 8       4     Memory size in bytes (u32 little-endian)
     * 12      4     Stack pointer (u32 little-endian)
     * 16      4     Runtime pointer (u32 little-endian)
     * 20      4     Context pointer (u32 little-endian)
     * 24      N     Memory data (N = memory size from offset 8)
     * ```
     */
    static serializeSnapshot(snapshot) {
        const textEncoder = new TextEncoder();
        // Calculate extension metadata size
        let extMetaSize = 4; // extCount (u32)
        const extEncodedNames = [];
        const extEncodedInitFns = [];
        for (const ext of snapshot.extensions) {
            const nameBytes = textEncoder.encode(ext.name);
            const initFnBytes = textEncoder.encode(ext.initFn);
            extEncodedNames.push(nameBytes);
            extEncodedInitFns.push(initFnBytes);
            extMetaSize += 4 + nameBytes.length + 4 + 4 + 4 + initFnBytes.length;
        }
        const totalSize = SNAPSHOT_HEADER_SIZE + extMetaSize + snapshot.memory.byteLength;
        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);
        const bytes = new Uint8Array(buffer);
        // Header
        view.setUint32(0, SNAPSHOT_MAGIC, false); // big-endian for readability in hex
        view.setUint8(4, SNAPSHOT_VERSION);
        // bytes 5-7 are reserved (already zero)
        view.setUint32(8, snapshot.memory.byteLength, true);
        view.setUint32(12, snapshot.stackPointer, true);
        view.setUint32(16, snapshot.runtimePtr, true);
        view.setUint32(20, snapshot.contextPtr, true);
        // Extension metadata (version 2)
        let offset = SNAPSHOT_HEADER_SIZE;
        view.setUint32(offset, snapshot.extensions.length, true);
        offset += 4;
        for (let i = 0; i < snapshot.extensions.length; i++) {
            const ext = snapshot.extensions[i];
            const nameBytes = extEncodedNames[i];
            const initFnBytes = extEncodedInitFns[i];
            view.setUint32(offset, nameBytes.length, true);
            offset += 4;
            bytes.set(nameBytes, offset);
            offset += nameBytes.length;
            view.setUint32(offset, ext.memoryBase, true);
            offset += 4;
            view.setUint32(offset, ext.tableBase, true);
            offset += 4;
            view.setUint32(offset, initFnBytes.length, true);
            offset += 4;
            bytes.set(initFnBytes, offset);
            offset += initFnBytes.length;
        }
        // Memory data
        bytes.set(snapshot.memory, offset);
        return bytes;
    }
    /**
     * Deserialize a snapshot from a binary buffer produced by `serializeSnapshot()`.
     */
    static deserializeSnapshot(data) {
        if (data.length < SNAPSHOT_HEADER_SIZE) {
            throw new Error('Invalid snapshot: too small');
        }
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        // Validate magic
        const magic = view.getUint32(0, false);
        if (magic !== SNAPSHOT_MAGIC) {
            throw new Error(`Invalid snapshot: bad magic (expected 0x${SNAPSHOT_MAGIC.toString(16)}, got 0x${magic.toString(16)})`);
        }
        // Validate version
        const version = view.getUint8(4);
        if (version !== SNAPSHOT_VERSION && version !== 1) {
            throw new Error(`Unsupported snapshot version: ${version} (expected ${SNAPSHOT_VERSION})`);
        }
        const memorySize = view.getUint32(8, true);
        const stackPointer = view.getUint32(12, true);
        const runtimePtr = view.getUint32(16, true);
        const contextPtr = view.getUint32(20, true);
        let extensions = [];
        let memoryOffset = SNAPSHOT_HEADER_SIZE;
        if (version >= 2) {
            // Version 2 adds extension metadata between the header and the memory data
            const extCount = view.getUint32(24, true);
            let offset = 28;
            const textDecoder = new TextDecoder();
            for (let i = 0; i < extCount; i++) {
                // name length (u32) + name (utf8) + memoryBase (u32) + tableBase (u32) + initFn length (u32) + initFn (utf8)
                const nameLen = view.getUint32(offset, true);
                offset += 4;
                const name = textDecoder.decode(data.slice(offset, offset + nameLen));
                offset += nameLen;
                const memBase = view.getUint32(offset, true);
                offset += 4;
                const tblBase = view.getUint32(offset, true);
                offset += 4;
                const initFnLen = view.getUint32(offset, true);
                offset += 4;
                const initFn = textDecoder.decode(data.slice(offset, offset + initFnLen));
                offset += initFnLen;
                extensions.push({ name, memoryBase: memBase, tableBase: tblBase, initFn });
            }
            memoryOffset = offset;
        }
        const expectedSize = memoryOffset + memorySize;
        if (data.length < expectedSize) {
            throw new Error(`Invalid snapshot: expected ${expectedSize} bytes, got ${data.length}`);
        }
        const memory = data.slice(memoryOffset, memoryOffset + memorySize);
        return { memory, stackPointer, runtimePtr, contextPtr, extensions };
    }
    // ---- Internal instantiation helpers ----
    static normalizeOptions(options) {
        if (!options)
            return {};
        if (options instanceof WebAssembly.Module)
            return { wasm: options };
        if (typeof options === 'object' && ('wasm' in options || 'wasi' in options || 'memoryLimit' in options || 'interruptHandler' in options || 'onUnhandledRejection' in options || 'moduleLoader' in options || 'intrinsics' in options || 'extensions' in options || 'timezoneOffset' in options))
            return options;
        // BufferSource (ArrayBuffer or ArrayBufferView)
        return { wasm: options };
    }
    static applyLimits(vm, opts) {
        if (opts.memoryLimit !== undefined) {
            vm.exports.qjs_set_memory_limit(opts.memoryLimit);
        }
        if (opts.interruptHandler) {
            vm.interruptHandler = opts.interruptHandler;
            vm.exports.qjs_set_interrupt_handler(1);
        }
        if (opts.onUnhandledRejection) {
            vm.unhandledRejectionHandler = opts.onUnhandledRejection;
            vm.exports.qjs_set_promise_rejection_handler(1);
        }
        if (opts.moduleLoader) {
            vm.moduleLoadHandler = opts.moduleLoader.load;
            vm.moduleNormalizeHandler = opts.moduleLoader.normalize ?? null;
            vm.exports.qjs_set_module_loader(1);
        }
        // Configure timezone handler.
        // The internal handler always returns the UTC offset in *seconds*
        // (positive east of UTC), which is what libc's __secs_to_zone expects.
        const tz = opts.timezoneOffset;
        if (typeof tz === 'function') {
            // User callback returns minutes (getTimezoneOffset convention:
            // positive west of UTC). Convert to seconds with sign flip.
            vm.timezoneOffsetHandler = (timeSecs) => -tz(timeSecs) * 60;
        }
        else if (typeof tz === 'number') {
            // Fixed offset in minutes, convert to seconds with sign flip.
            const offsetSecs = -tz * 60;
            vm.timezoneOffsetHandler = () => offsetSecs;
        }
        else {
            // 'host' (default): use the host's timezone
            vm.timezoneOffsetHandler = (timeSecs) => {
                return -new Date(timeSecs * 1000).getTimezoneOffset() * 60;
            };
        }
    }
    static async resolveModule(wasmInput) {
        if (wasmInput instanceof WebAssembly.Module) {
            return wasmInput;
        }
        else if (wasmInput) {
            return WebAssembly.compile(wasmInput);
        }
        else {
            const { readFile } = await import('node:fs/promises');
            const buf = await readFile(new URL('../quickjs.wasm', import.meta.url));
            return WebAssembly.compile(buf);
        }
    }
    static async instantiate(module, vm, wasiOptions) {
        let memory = null;
        // Create a memory proxy that defers to the actual memory once set.
        // This allows WASI override factories to close over the memory reference
        // before the WASM instance is created.
        const memoryProxy = new Proxy({}, {
            get(_target, prop) {
                return memory[prop];
            },
        });
        // Build the builtins (no user overrides)
        const wasiBuiltins = createWasiShim(() => memory);
        // Resolve user overrides via factory
        const wasiUserOverrides = wasiOptions ? wasiOptions(memoryProxy) : undefined;
        // Final shim for the main module: builtins + user overrides
        const wasiShim = { ...wasiBuiltins, ...wasiUserOverrides };
        const hostCall = (namePtr, nameLen, thisPtr, argc, argvPtr) => {
            return vm.handleHostCall(namePtr, nameLen, thisPtr, argc, argvPtr);
        };
        const hostInterrupt = () => {
            return vm.interruptHandler ? (vm.interruptHandler() ? 1 : 0) : 0;
        };
        const hostPromiseRejection = (promisePtr, reasonPtr, isHandled) => {
            if (!vm.unhandledRejectionHandler) {
                // No handler registered — free the heap-allocated values
                vm.exports.qjs_free_value(promisePtr);
                vm.exports.qjs_free_value(reasonPtr);
                return;
            }
            const promise = new JSValueHandle(vm, promisePtr);
            const reason = new JSValueHandle(vm, reasonPtr);
            try {
                vm.unhandledRejectionHandler(promise, reason, isHandled !== 0);
            }
            finally {
                promise.dispose();
                reason.dispose();
            }
        };
        // Module normalizer: resolve a specifier relative to a base name.
        // Returns a malloc'd null-terminated string in WASM memory, or 0 (NULL) on error.
        const hostModuleNormalize = (baseNamePtr, namePtr) => {
            if (!vm.moduleNormalizeHandler) {
                // No normalize handler — return a copy of the specifier as-is
                const name = vm.readCString(namePtr);
                return vm.writeString(name).ptr;
            }
            const baseName = vm.readCString(baseNamePtr);
            const specifier = vm.readCString(namePtr);
            try {
                const normalized = vm.moduleNormalizeHandler(baseName, specifier);
                return vm.writeString(normalized).ptr;
            }
            catch {
                return 0;
            }
        };
        // Module loader: return source code for a module.
        // Returns a malloc'd string pointer, writes length to *outLenPtr.
        const hostModuleLoad = (namePtr, outLenPtr) => {
            if (!vm.moduleLoadHandler)
                return 0;
            const name = vm.readCString(namePtr);
            try {
                const source = vm.moduleLoadHandler(name);
                const { ptr, len } = vm.writeString(source);
                new Uint32Array(vm.exports.memory.buffer, outLenPtr, 1)[0] = len;
                return ptr;
            }
            catch {
                return 0;
            }
        };
        // host_get_timezone_offset receives time as split i32 (hi, lo) and
        // returns the UTC offset in seconds.
        const hostGetTimezoneOffset = (hi, lo) => {
            const timeSecs = Number((BigInt(hi) << 32n) | BigInt(lo >>> 0));
            return vm.timezoneOffsetHandler ? vm.timezoneOffsetHandler(timeSecs) : 0;
        };
        const instance = await WebAssembly.instantiate(module, {
            env: {
                host_call: hostCall,
                host_interrupt: hostInterrupt,
                host_promise_rejection: hostPromiseRejection,
                host_module_normalize: hostModuleNormalize,
                host_module_load: hostModuleLoad,
                host_get_timezone_offset: hostGetTimezoneOffset,
            },
            wasi_snapshot_preview1: wasiShim,
        });
        memory = instance.exports.memory;
        return { instance, wasiBuiltins, wasiUserOverrides, memoryProxy };
    }
    /**
     * Called from WASM when a host function is invoked from QuickJS code.
     */
    handleHostCall(namePtr, nameLen, thisPtr, argc, argvPtr) {
        const name = this.decoder.decode(new Uint8Array(this.exports.memory.buffer, namePtr, nameLen));
        const callback = this.hostCallbacks.get(name);
        if (!callback) {
            return this.exports.qjs_get_undefined();
        }
        const thisHandle = new JSValueHandle(this, thisPtr);
        const args = [];
        if (argc > 0 && argvPtr !== 0) {
            const view = new DataView(this.exports.memory.buffer);
            for (let i = 0; i < argc; i++) {
                const argPtr = view.getUint32(argvPtr + i * 4, true);
                args.push(new JSValueHandle(this, argPtr));
            }
        }
        try {
            const result = callback.call(thisHandle, ...args);
            return this.exports.qjs_dup_value(result.ptr);
        }
        catch (err) {
            // Throw an exception inside QuickJS and return NULL to signal
            // to the C trampoline that an exception was thrown.
            const errHandle = this.newError(err instanceof Error ? err : String(err));
            this.exports.qjs_throw(errHandle.ptr);
            errHandle.dispose();
            return 0;
        }
    }
    // ---- String helpers ----
    /** Write a JS string into WASM memory, returning the pointer. Caller must free. */
    writeString(str) {
        const encoded = this.encoder.encode(str);
        const ptr = this.exports.wasm_malloc(encoded.length + 1);
        if (ptr === 0)
            throw new Error('wasm_malloc failed');
        const mem = new Uint8Array(this.exports.memory.buffer);
        mem.set(encoded, ptr);
        mem[ptr + encoded.length] = 0;
        return { ptr, len: encoded.length };
    }
    /** Read a null-terminated C string from WASM memory */
    readCString(ptr) {
        const mem = new Uint8Array(this.exports.memory.buffer);
        let end = ptr;
        while (mem[end] !== 0)
            end++;
        return this.decoder.decode(mem.slice(ptr, end));
    }
    // ---- Public API ----
    /**
     * Check if a result handle is an exception and throw a JSException if so.
     * Used internally by evalCode and callFunction.
     */
    throwIfException(result) {
        if (this.exports.qjs_is_exception(result.ptr) !== 0) {
            const exc = this.getException();
            result.dispose();
            // Track the handle so it gets cleaned up if the VM is disposed
            // before the caller disposes the exception.
            this._ownedHandles.add(exc);
            throw new JSException(exc);
        }
        return result;
    }
    /**
     * Evaluate JavaScript code and return the result as a handle.
     * If the code throws, a `JSException` (which extends `Error`) is thrown
     * on the host side — matching standard JavaScript semantics.
     *
     * @param code - The JavaScript source code to evaluate.
     * @param filename - Optional filename for error stack traces (default `'<eval>'`).
     * @param flags - Optional bitwise OR of `EvalFlags.*` constants.
     *   For example, pass `EvalFlags.ASYNC` to allow top-level `await` — the
     *   returned handle will be a Promise that resolves to the completion value.
     */
    evalCode(code, filename = '<eval>', flags = 0) {
        this.assertNotDisposed();
        const codeStr = this.writeString(code);
        const fnStr = this.writeString(filename);
        const resultPtr = this.exports.qjs_eval(codeStr.ptr, codeStr.len, fnStr.ptr, flags);
        this.exports.wasm_free(codeStr.ptr);
        this.exports.wasm_free(fnStr.ptr);
        return this.throwIfException(new JSValueHandle(this, resultPtr));
    }
    /**
     * Compile JavaScript source code to bytecode without executing it.
     * The returned `Uint8Array` can be stored, transferred, or later executed
     * with `evalBytecode()`.
     *
     * @param code - The JavaScript source code to compile.
     * @param filename - Optional filename for error stack traces (default `'<compile>'`).
     * @param evalFlags - Optional bitwise OR of `EvalFlags.*` constants.
     *   Use `EvalFlags.TYPE_MODULE` to compile as a module.
     * @param compileFlags - Optional bitwise OR of `CompileFlags.*` constants.
     *   Use `CompileFlags.STRIP_SOURCE` and/or `CompileFlags.STRIP_DEBUG` to
     *   reduce bytecode size.
     */
    compile(code, filename = '<compile>', evalFlags = 0, compileFlags = 0) {
        this.assertNotDisposed();
        const codeStr = this.writeString(code);
        const fnStr = this.writeString(filename);
        // Allocate space for the output length (size_t = 4 bytes in wasm32)
        const outLenPtr = this.exports.wasm_malloc(4);
        const bufPtr = this.exports.qjs_compile(codeStr.ptr, codeStr.len, fnStr.ptr, evalFlags, compileFlags, outLenPtr);
        this.exports.wasm_free(codeStr.ptr);
        this.exports.wasm_free(fnStr.ptr);
        if (bufPtr === 0) {
            this.exports.wasm_free(outLenPtr);
            // Compilation failed — throw the QuickJS exception
            const exc = this.getException();
            throw new Error(`Compilation error: ${exc.toString()}`);
        }
        const outLen = new Uint32Array(this.exports.memory.buffer, outLenPtr, 1)[0];
        this.exports.wasm_free(outLenPtr);
        // Copy the bytecode out of WASM memory before freeing
        const bytecode = new Uint8Array(this.exports.memory.buffer, bufPtr, outLen).slice();
        this.exports.wasm_free(bufPtr);
        return bytecode;
    }
    /**
     * Execute previously compiled bytecode (from `compile()`).
     * Returns the evaluation result as a handle.
     *
     * @param bytecode - The bytecode `Uint8Array` from `compile()`.
     */
    evalBytecode(bytecode) {
        this.assertNotDisposed();
        const bufPtr = this.exports.wasm_malloc(bytecode.byteLength);
        new Uint8Array(this.exports.memory.buffer, bufPtr, bytecode.byteLength).set(bytecode);
        const resultPtr = this.exports.qjs_eval_bytecode(bufPtr, bytecode.byteLength);
        this.exports.wasm_free(bufPtr);
        return this.throwIfException(new JSValueHandle(this, resultPtr));
    }
    /**
     * Execute all pending microtask jobs (promise reactions, etc.)
     * Returns the number of jobs executed.
     */
    executePendingJobs() {
        this.assertNotDisposed();
        let count = 0;
        while (this.exports.qjs_is_job_pending()) {
            const result = this.exports.qjs_execute_pending_job();
            if (result < 0) {
                const exc = this.getException();
                throw new Error(`Job execution error: ${exc.toString()}`);
            }
            count++;
        }
        return count;
    }
    /**
     * Explicitly trigger garbage collection. QuickJS runs GC automatically,
     * but this can be useful to reclaim memory at a known point or before
     * taking a snapshot.
     */
    runGC() {
        this.assertNotDisposed();
        this.exports.qjs_run_gc();
    }
    /**
     * The GC threshold in bytes. When allocated memory exceeds this value,
     * garbage collection is triggered automatically. Set to 0 to disable
     * automatic GC.
     */
    get gcThreshold() {
        this.assertNotDisposed();
        return this.exports.qjs_get_gc_threshold();
    }
    set gcThreshold(threshold) {
        this.assertNotDisposed();
        this.exports.qjs_set_gc_threshold(threshold);
    }
    /**
     * Get detailed memory usage statistics from the QuickJS runtime.
     * Returns counts and sizes for atoms, strings, objects, functions, etc.
     */
    getMemoryUsage() {
        this.assertNotDisposed();
        // Allocate a buffer for 26 int64 fields (26 * 8 = 208 bytes)
        const bufPtr = this.exports.wasm_malloc(26 * 8);
        this.exports.qjs_compute_memory_usage(bufPtr);
        const view = new BigInt64Array(this.exports.memory.buffer, bufPtr, 26);
        const result = {
            mallocSize: Number(view[0]),
            mallocLimit: Number(view[1]),
            memoryUsedSize: Number(view[2]),
            mallocCount: Number(view[3]),
            memoryUsedCount: Number(view[4]),
            atomCount: Number(view[5]),
            atomSize: Number(view[6]),
            strCount: Number(view[7]),
            strSize: Number(view[8]),
            objCount: Number(view[9]),
            objSize: Number(view[10]),
            propCount: Number(view[11]),
            propSize: Number(view[12]),
            shapeCount: Number(view[13]),
            shapeSize: Number(view[14]),
            jsFuncCount: Number(view[15]),
            jsFuncSize: Number(view[16]),
            jsFuncCodeSize: Number(view[17]),
            jsFuncPc2lineCount: Number(view[18]),
            jsFuncPc2lineSize: Number(view[19]),
            cFuncCount: Number(view[20]),
            arrayCount: Number(view[21]),
            fastArrayCount: Number(view[22]),
            fastArrayElements: Number(view[23]),
            binaryObjectCount: Number(view[24]),
            binaryObjectSize: Number(view[25]),
        };
        this.exports.wasm_free(bufPtr);
        return result;
    }
    /**
     * Get the global object. Prefer the cached `vm.global` property.
     */
    getGlobal() {
        this.assertNotDisposed();
        return new JSValueHandle(this, this.exports.qjs_get_global());
    }
    /**
     * Create a new QuickJS string value.
     */
    newString(str) {
        this.assertNotDisposed();
        const { ptr, len } = this.writeString(str);
        const resultPtr = this.exports.qjs_new_string(ptr, len);
        this.exports.wasm_free(ptr);
        return new JSValueHandle(this, resultPtr);
    }
    /**
     * Create a new QuickJS number value.
     */
    newNumber(num) {
        this.assertNotDisposed();
        return new JSValueHandle(this, this.exports.qjs_new_number(num));
    }
    /**
     * Create a new QuickJS BigInt value.
     */
    newBigInt(val) {
        this.assertNotDisposed();
        // Split the bigint into lo/hi 32-bit halves
        const lo = Number(val & 0xffffffffn);
        const hi = Number((val >> 32n) & 0xffffffffn);
        return new JSValueHandle(this, this.exports.qjs_new_big_int64(lo, hi));
    }
    /**
     * Create a new QuickJS object value.
     */
    newObject() {
        this.assertNotDisposed();
        return new JSValueHandle(this, this.exports.qjs_new_object());
    }
    /**
     * Create a new QuickJS array value.
     */
    newArray() {
        this.assertNotDisposed();
        return new JSValueHandle(this, this.exports.qjs_new_array());
    }
    /**
     * Create a global symbol (`Symbol.for(description)`).
     * Global symbols with the same description are always the same symbol,
     * even across snapshot/restore.
     */
    newSymbolFor(description) {
        this.assertNotDisposed();
        const { ptr, len } = this.writeString(description);
        const result = new JSValueHandle(this, this.exports.qjs_new_symbol(ptr, len, 1));
        this.exports.wasm_free(ptr);
        return result;
    }
    /**
     * Create a new QuickJS ArrayBuffer by copying data from a host buffer.
     */
    newArrayBuffer(data) {
        this.assertNotDisposed();
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
        const ptr = this.exports.wasm_malloc(bytes.length);
        if (ptr === 0)
            throw new Error('wasm_malloc failed');
        new Uint8Array(this.exports.memory.buffer).set(bytes, ptr);
        const result = new JSValueHandle(this, this.exports.qjs_new_array_buffer(ptr, bytes.length));
        this.exports.wasm_free(ptr);
        return result;
    }
    /**
     * Create a new QuickJS Uint8Array by copying data from a host buffer.
     */
    newUint8Array(data) {
        this.assertNotDisposed();
        const ptr = this.exports.wasm_malloc(data.length);
        if (ptr === 0)
            throw new Error('wasm_malloc failed');
        new Uint8Array(this.exports.memory.buffer).set(data, ptr);
        const result = new JSValueHandle(this, this.exports.qjs_new_uint8_array(ptr, data.length));
        this.exports.wasm_free(ptr);
        return result;
    }
    /**
     * Get undefined. Prefer the cached `vm.undefined` property.
     */
    getUndefined() {
        this.assertNotDisposed();
        return new JSValueHandle(this, this.exports.qjs_get_undefined());
    }
    /**
     * Get null. Prefer the cached `vm.null` property.
     */
    getNull() {
        this.assertNotDisposed();
        return new JSValueHandle(this, this.exports.qjs_get_null());
    }
    /**
     * Get true. Prefer the cached `vm.true` property.
     */
    getTrue() {
        this.assertNotDisposed();
        return new JSValueHandle(this, this.exports.qjs_get_true());
    }
    /**
     * Get false. Prefer the cached `vm.false` property.
     */
    getFalse() {
        this.assertNotDisposed();
        return new JSValueHandle(this, this.exports.qjs_get_false());
    }
    /**
     * Create a new QuickJS function backed by a host callback.
     *
     * When the function is called inside QuickJS, the host callback is invoked
     * with the `this` value and arguments as JSValueHandles.
     */
    newFunction(name, fn) {
        this.assertNotDisposed();
        if (this.hostCallbacks.has(name)) {
            throw new Error(`Host callback with name "${name}" is already registered`);
        }
        this.hostCallbacks.set(name, fn);
        const { ptr: namePtr, len: nameLen } = this.writeString(name);
        const resultPtr = this.exports.qjs_new_host_function(namePtr, nameLen, 0);
        this.exports.wasm_free(namePtr);
        return new JSValueHandle(this, resultPtr);
    }
    /**
     * Create an internal host function that bypasses the duplicate-name check.
     * Used for ephemeral callbacks (promise settle handlers, resolvePromise, etc.)
     * that are not intended to survive snapshot/restore.
     */
    newInternalFunction(name, fn) {
        this.hostCallbacks.set(name, fn);
        const { ptr: namePtr, len: nameLen } = this.writeString(name);
        const resultPtr = this.exports.qjs_new_host_function(namePtr, nameLen, 0);
        this.exports.wasm_free(namePtr);
        return new JSValueHandle(this, resultPtr);
    }
    /**
     * Create a new promise.
     *
     * Returns a Deferred with:
     * - `handle` - the QuickJS promise object
     * - `settled` - a host Promise that resolves when the QuickJS promise settles
     * - `resolve(value)` - resolve the promise with a QuickJS value
     * - `reject(value)` - reject the promise with a QuickJS value
     */
    newPromise() {
        this.assertNotDisposed();
        const resolveOutPtr = this.exports.wasm_malloc(4);
        const rejectOutPtr = this.exports.wasm_malloc(4);
        const promisePtr = this.exports.qjs_new_promise(resolveOutPtr, rejectOutPtr);
        const view = new DataView(this.exports.memory.buffer);
        const resolvePtr = view.getUint32(resolveOutPtr, true);
        const rejectPtr = view.getUint32(rejectOutPtr, true);
        this.exports.wasm_free(resolveOutPtr);
        this.exports.wasm_free(rejectOutPtr);
        const promiseHandle = new JSValueHandle(this, promisePtr);
        const resolveHandle = new JSValueHandle(this, resolvePtr);
        const rejectHandle = new JSValueHandle(this, rejectPtr);
        const vm = this;
        // Track resolve/reject handles so they can be freed on VM dispose
        // if the promise is never resolved/rejected
        vm._ownedHandles.add(resolveHandle);
        vm._ownedHandles.add(rejectHandle);
        // Lazily-created settled promise — only attaches .then() handler when accessed
        let _settled = null;
        return {
            handle: promiseHandle,
            get settled() {
                if (!_settled) {
                    let settledResolve;
                    _settled = new Promise((res) => {
                        settledResolve = res;
                    });
                    const settleName = `__settle:${vm.nextInternalId++}`;
                    const onSettleFn = vm.newInternalFunction(settleName, () => {
                        settledResolve();
                        vm.hostCallbacks.delete(settleName);
                        return vm.undefined;
                    });
                    const thenFn = promiseHandle.getProp('then');
                    const onSettleDup = onSettleFn.dup();
                    vm.callFunctionRaw(thenFn, promiseHandle, onSettleFn, onSettleDup).dispose();
                    thenFn.dispose();
                    onSettleFn.dispose();
                    onSettleDup.dispose();
                }
                return _settled;
            },
            resolve(value) {
                vm.callFunctionRaw(resolveHandle, vm.undefined, value).dispose();
                vm._ownedHandles.delete(resolveHandle);
                resolveHandle.dispose();
            },
            reject(value) {
                vm.callFunctionRaw(rejectHandle, vm.undefined, value).dispose();
                vm._ownedHandles.delete(rejectHandle);
                rejectHandle.dispose();
            },
        };
    }
    /**
     * Resolve a promise handle. Returns a host-side Promise that resolves
     * with the settled value/error of the QuickJS promise.
     *
     * If the handle is not a promise, it is treated as an already-fulfilled value.
     *
     * The returned host Promise resolves to `{ value: JSValueHandle }` on
     * fulfillment or `{ error: JSValueHandle }` on rejection.
     */
    resolvePromise(promiseHandle) {
        this.assertNotDisposed();
        // If the handle is not a promise, treat it as a fulfilled value
        if (!this.exports.qjs_is_promise(promiseHandle.ptr)) {
            return Promise.resolve({ value: promiseHandle.dup() });
        }
        // Check if already settled
        const state = this.exports.qjs_promise_state(promiseHandle.ptr);
        if (state === 1) {
            // fulfilled
            return Promise.resolve({ value: new JSValueHandle(this, this.exports.qjs_promise_result(promiseHandle.ptr)) });
        }
        else if (state === 2) {
            // rejected
            return Promise.resolve({ error: new JSValueHandle(this, this.exports.qjs_promise_result(promiseHandle.ptr)) });
        }
        // Pending — attach a .then/.catch to get notified
        return new Promise((hostResolve) => {
            const id = this.nextInternalId++;
            const fulfilledName = `__onFulfilled:${id}`;
            const rejectedName = `__onRejected:${id}`;
            const onFulfilled = this.newInternalFunction(fulfilledName, (...args) => {
                const val = args[0]?.dup() ?? this.undefined;
                this.hostCallbacks.delete(fulfilledName);
                this.hostCallbacks.delete(rejectedName);
                hostResolve({ value: val });
                return this.undefined;
            });
            const onRejected = this.newInternalFunction(rejectedName, (...args) => {
                const val = args[0]?.dup() ?? this.undefined;
                this.hostCallbacks.delete(fulfilledName);
                this.hostCallbacks.delete(rejectedName);
                hostResolve({ error: val });
                return this.undefined;
            });
            const thenFn = promiseHandle.getProp('then');
            this.callFunctionRaw(thenFn, promiseHandle, onFulfilled, onRejected).dispose();
            thenFn.dispose();
            onFulfilled.dispose();
            onRejected.dispose();
        });
    }
    /**
     * Call a QuickJS function. If the function throws, a `JSException`
     * is thrown on the host side.
     */
    callFunction(func, thisVal, ...args) {
        return this.throwIfException(this.callFunctionRaw(func, thisVal, ...args));
    }
    /**
     * Internal: call a QuickJS function without throwing on exception.
     * Used by promise plumbing where exceptions are handled differently.
     */
    callFunctionRaw(func, thisVal, ...args) {
        this.assertNotDisposed();
        const argc = args.length;
        let argvPtr = 0;
        if (argc > 0) {
            argvPtr = this.exports.wasm_malloc(argc * 4);
            const view = new DataView(this.exports.memory.buffer);
            for (let i = 0; i < argc; i++) {
                view.setUint32(argvPtr + i * 4, args[i].ptr, true);
            }
        }
        const resultPtr = this.exports.qjs_call(func.ptr, thisVal.ptr, argc, argvPtr);
        if (argvPtr)
            this.exports.wasm_free(argvPtr);
        return new JSValueHandle(this, resultPtr);
    }
    /**
     * Set a property on an object. Accepts string or JSValueHandle as key.
     * JSValueHandle keys support symbols (including `Symbol.for()`).
     */
    setProp(obj, key, value) {
        this.assertNotDisposed();
        if (typeof key === 'string') {
            const { ptr: namePtr } = this.writeString(key);
            this.exports.qjs_set_prop_string(obj.ptr, namePtr, value.ptr);
            this.exports.wasm_free(namePtr);
        }
        else {
            this.exports.qjs_set_prop_value(obj.ptr, key.ptr, value.ptr);
        }
    }
    /**
     * Define a property on an object with explicit property descriptor flags.
     * Unlike `setProp`, this allows controlling `writable`, `enumerable`, and
     * `configurable` attributes, matching `Object.defineProperty()` semantics.
     * Accepts string or JSValueHandle as key (JSValueHandle keys support symbols).
     *
     * All flags default to `false` when not specified.
     */
    defineProp(obj, key, value, descriptor) {
        this.assertNotDisposed();
        let flags = 0;
        if (descriptor?.configurable)
            flags |= 1; // JS_PROP_CONFIGURABLE
        if (descriptor?.writable)
            flags |= 2; // JS_PROP_WRITABLE
        if (descriptor?.enumerable)
            flags |= 4; // JS_PROP_ENUMERABLE
        if (typeof key === 'string') {
            const { ptr: namePtr } = this.writeString(key);
            this.exports.qjs_define_prop_string(obj.ptr, namePtr, value.ptr, flags);
            this.exports.wasm_free(namePtr);
        }
        else {
            this.exports.qjs_define_prop_value(obj.ptr, key.ptr, value.ptr, flags);
        }
    }
    /**
     * Get a property from an object using a JSValueHandle key.
     * Supports symbol keys (including `Symbol.for()`).
     */
    getProp(obj, key) {
        this.assertNotDisposed();
        return new JSValueHandle(this, this.exports.qjs_get_prop_value(obj.ptr, key.ptr));
    }
    /**
     * Get the current exception, if any.
     */
    getException() {
        this.assertNotDisposed();
        return new JSValueHandle(this, this.exports.qjs_get_exception());
    }
    /**
     * Create a new QuickJS Error object.
     * Accepts a string message or a native Error object.
     */
    newError(messageOrError) {
        this.assertNotDisposed();
        const errPtr = this.exports.qjs_new_error();
        const errHandle = new JSValueHandle(this, errPtr);
        if (typeof messageOrError === 'string') {
            const msgHandle = this.newString(messageOrError);
            errHandle.setProp('message', msgHandle);
            msgHandle.dispose();
        }
        else {
            const msgHandle = this.newString(messageOrError.message);
            errHandle.setProp('message', msgHandle);
            msgHandle.dispose();
            if (messageOrError.name) {
                const nameHandle = this.newString(messageOrError.name);
                errHandle.setProp('name', nameHandle);
                nameHandle.dispose();
            }
            if (messageOrError.stack) {
                const stackHandle = this.newString(messageOrError.stack);
                errHandle.setProp('stack', stackHandle);
                stackHandle.dispose();
            }
        }
        return errHandle;
    }
    /**
     * Get the typeof a handle as a string.
     */
    typeof(handle) {
        this.assertNotDisposed();
        const e = this.exports;
        if (e.qjs_is_undefined(handle.ptr))
            return 'undefined';
        if (e.qjs_is_null(handle.ptr))
            return 'object'; // typeof null === 'object'
        if (e.qjs_is_bool(handle.ptr))
            return 'boolean';
        if (e.qjs_is_number(handle.ptr))
            return 'number';
        if (e.qjs_is_big_int(handle.ptr))
            return 'bigint';
        if (e.qjs_is_string(handle.ptr))
            return 'string';
        if (e.qjs_is_symbol(handle.ptr))
            return 'symbol';
        if (e.qjs_is_function(handle.ptr))
            return 'function';
        if (e.qjs_is_object(handle.ptr))
            return 'object';
        return 'unknown';
    }
    /**
     * Convert a QuickJS handle to a host JavaScript value.
     * Handles strings, numbers, booleans, null, undefined, bigint, arrays,
     * errors, functions, and plain objects. Circular references in objects
     * are returned as `undefined`.
     */
    dump(handle) {
        this.assertNotDisposed();
        return this._dump(handle, new Map());
    }
    _dump(handle, visited) {
        const e = this.exports;
        if (e.qjs_is_undefined(handle.ptr))
            return undefined;
        if (e.qjs_is_null(handle.ptr))
            return null;
        if (e.qjs_is_bool(handle.ptr))
            return e.qjs_get_bool(handle.ptr) !== 0;
        if (e.qjs_is_number(handle.ptr))
            return e.qjs_get_float64(handle.ptr);
        if (e.qjs_is_string(handle.ptr))
            return handle.toString();
        if (e.qjs_is_big_int(handle.ptr))
            return handle.toBigInt();
        if (e.qjs_is_symbol(handle.ptr)) {
            const descOutPtr = e.wasm_malloc(4);
            const kind = e.qjs_get_symbol_description(handle.ptr, descOutPtr);
            const view = new DataView(e.memory.buffer);
            const descPtr = view.getUint32(descOutPtr, true);
            e.wasm_free(descOutPtr);
            if (kind === 1) {
                // Global symbol — reconstruct as Symbol.for(description)
                const descHandle = new JSValueHandle(this, descPtr);
                const description = descHandle.toString();
                descHandle.dispose();
                return Symbol.for(description);
            }
            else if (kind === 2) {
                // Local (anonymous) symbol — can't be reconstructed on host
                const descHandle = new JSValueHandle(this, descPtr);
                descHandle.dispose();
                return undefined;
            }
            return undefined;
        }
        if (e.qjs_is_array_buffer(handle.ptr))
            return handle.toArrayBuffer();
        if (e.qjs_is_exception(handle.ptr)) {
            const exc = this.getException();
            const msg = exc.toString();
            exc.dispose();
            return new Error(msg);
        }
        // Functions cannot be meaningfully serialized
        if (e.qjs_is_function(handle.ptr))
            return undefined;
        // Detect circular references using the underlying JS object pointer.
        // If we've already visited this object, return the same host object
        // (preserving the circular structure on the host side).
        if (e.qjs_is_object(handle.ptr)) {
            const objPtr = e.qjs_get_value_ptr(handle.ptr);
            if (objPtr) {
                const existing = visited.get(objPtr);
                if (existing !== undefined)
                    return existing;
            }
        }
        // Check for typed arrays (before regular array check — typed arrays are not Array.isArray)
        if (e.qjs_is_object(handle.ptr)) {
            const byteOffsetPtr = e.wasm_malloc(4);
            const byteLengthPtr = e.wasm_malloc(4);
            const bytesPerElemPtr = e.wasm_malloc(4);
            const abPtr = e.qjs_get_typed_array_buffer(handle.ptr, byteOffsetPtr, byteLengthPtr, bytesPerElemPtr);
            const abHandle = new JSValueHandle(this, abPtr);
            if (e.qjs_is_exception(abHandle.ptr) === 0) {
                const view = new DataView(e.memory.buffer);
                const byteOffset = view.getUint32(byteOffsetPtr, true);
                const byteLength = view.getUint32(byteLengthPtr, true);
                const bytesPerElement = view.getUint32(bytesPerElemPtr, true);
                e.wasm_free(byteOffsetPtr);
                e.wasm_free(byteLengthPtr);
                e.wasm_free(bytesPerElemPtr);
                const abLenPtr = e.wasm_malloc(4);
                const abDataPtr = e.qjs_get_array_buffer(abHandle.ptr, abLenPtr);
                e.wasm_free(abLenPtr);
                abHandle.dispose();
                if (abDataPtr !== 0) {
                    const rawBytes = new Uint8Array(e.memory.buffer, abDataPtr + byteOffset, byteLength).slice();
                    switch (bytesPerElement) {
                        case 1: return rawBytes;
                        case 2: return new Uint16Array(rawBytes.buffer);
                        case 4: return new Uint32Array(rawBytes.buffer);
                        case 8: return new Float64Array(rawBytes.buffer);
                        default: return rawBytes;
                    }
                }
            }
            else {
                abHandle.dispose();
                e.wasm_free(byteOffsetPtr);
                e.wasm_free(byteLengthPtr);
                e.wasm_free(bytesPerElemPtr);
            }
        }
        if (e.qjs_is_array(handle.ptr)) {
            const lenHandle = handle.getProp('length');
            const len = e.qjs_get_float64(lenHandle.ptr);
            lenHandle.dispose();
            const arr = [];
            // Register the array in the visited map BEFORE populating it,
            // so circular references within the array resolve to this same array.
            const objPtr = e.qjs_get_value_ptr(handle.ptr);
            if (objPtr)
                visited.set(objPtr, arr);
            for (let i = 0; i < len; i++) {
                const elemPtr = e.qjs_get_prop_uint32(handle.ptr, i);
                const elemHandle = new JSValueHandle(this, elemPtr);
                arr.push(this._dump(elemHandle, visited));
                elemHandle.dispose();
            }
            return arr;
        }
        if (e.qjs_is_error(handle.ptr)) {
            const nameHandle = handle.getProp('name');
            const msgHandle = handle.getProp('message');
            const stackHandle = handle.getProp('stack');
            const name = nameHandle.isUndefined ? 'Error' : nameHandle.toString();
            const message = msgHandle.isUndefined ? '' : msgHandle.toString();
            const stack = stackHandle.isUndefined ? undefined : stackHandle.toString();
            nameHandle.dispose();
            msgHandle.dispose();
            stackHandle.dispose();
            const err = new Error(message);
            err.name = name;
            if (stack !== undefined) {
                err.stack = stack;
            }
            return err;
        }
        if (e.qjs_is_object(handle.ptr)) {
            const keysPtr = e.qjs_get_own_property_names(handle.ptr);
            const keysHandle = new JSValueHandle(this, keysPtr);
            if (e.qjs_is_exception(keysHandle.ptr) !== 0) {
                keysHandle.dispose();
                return {};
            }
            const lenHandle = keysHandle.getProp('length');
            const len = e.qjs_get_float64(lenHandle.ptr);
            lenHandle.dispose();
            const obj = {};
            // Register the object in the visited map BEFORE populating it,
            // so circular references resolve to this same object.
            const objPtr = e.qjs_get_value_ptr(handle.ptr);
            if (objPtr)
                visited.set(objPtr, obj);
            for (let i = 0; i < len; i++) {
                const keyPtr = e.qjs_get_prop_uint32(keysHandle.ptr, i);
                const keyHandle = new JSValueHandle(this, keyPtr);
                const key = keyHandle.toString();
                keyHandle.dispose();
                const valHandle = handle.getProp(key);
                obj[key] = this._dump(valHandle, visited);
                valHandle.dispose();
            }
            keysHandle.dispose();
            return obj;
        }
        return undefined;
    }
    /**
     * Convert a host JavaScript value to a QuickJS handle.
     */
    hostToHandle(value) {
        this.assertNotDisposed();
        if (value === undefined)
            return this.undefined;
        if (value === null)
            return this.null;
        if (value === true)
            return this.true;
        if (value === false)
            return this.false;
        if (typeof value === 'number')
            return this.newNumber(value);
        if (typeof value === 'string')
            return this.newString(value);
        if (typeof value === 'bigint')
            return this.newBigInt(value);
        if (typeof value === 'symbol') {
            const key = Symbol.keyFor(value);
            if (key !== undefined) {
                return this.newSymbolFor(key);
            }
            // Local symbols can't be transferred to QuickJS
            throw new Error(`Cannot convert local symbol to QuickJS handle. Use Symbol.for() for cross-boundary symbols.`);
        }
        if (value instanceof Promise) {
            const deferred = this.newPromise();
            value.then((r) => {
                deferred.resolve(this.hostToHandle(r));
                this.executePendingJobs();
            }, (err) => {
                deferred.reject(this.hostToHandle(err));
                this.executePendingJobs();
            });
            return deferred.handle;
        }
        if (value instanceof Error) {
            return this.newError(value);
        }
        if (value instanceof ArrayBuffer) {
            return this.newArrayBuffer(value);
        }
        if (value instanceof Uint8Array) {
            return this.newUint8Array(value);
        }
        if (ArrayBuffer.isView(value)) {
            // Other typed arrays — convert via Uint8Array view of the underlying buffer
            return this.newArrayBuffer(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
        }
        if (Array.isArray(value)) {
            const arr = this.newArray();
            for (let i = 0; i < value.length; i++) {
                const elemHandle = this.hostToHandle(value[i]);
                this.exports.qjs_set_prop_uint32(arr.ptr, i, elemHandle.ptr);
                elemHandle.dispose();
            }
            return arr;
        }
        if (typeof value === 'object' && value !== null) {
            const obj = this.newObject();
            for (const [key, val] of Object.entries(value)) {
                const valHandle = this.hostToHandle(val);
                obj.setProp(key, valHandle);
                valHandle.dispose();
            }
            return obj;
        }
        return this.undefined;
    }
    // ---- Snapshot / Restore ----
    /**
     * Snapshot the entire VM state.
     *
     * Returns a snapshot containing the full WASM linear memory. Use
     * `QuickJS.serializeSnapshot()` to convert to a versioned binary
     * buffer for persistent storage.
     */
    snapshot() {
        this.assertNotDisposed();
        return {
            memory: new Uint8Array(this.exports.memory.buffer).slice(),
            stackPointer: this.exports.__stack_pointer.value,
            runtimePtr: this.exports.qjs_get_runtime_ptr(),
            contextPtr: this.exports.qjs_get_context_ptr(),
            extensions: this.loadedExtensions.map((ext) => ({
                name: ext.name,
                memoryBase: ext.memoryBase,
                tableBase: ext.tableBase,
                initFn: ext.initFn,
            })),
        };
    }
    /**
     * Re-register a host callback after restoring from a snapshot.
     * The name must match the name passed to `newFunction()` before the snapshot.
     */
    registerHostCallback(name, fn) {
        this.hostCallbacks.set(name, fn);
    }
    /**
     * Dispose the VM, releasing all references to the WASM instance
     * so it can be garbage collected by the host JS engine.
     */
    dispose() {
        if (!this.disposed) {
            this.disposed = true;
            // Release references so the WASM instance and its linear memory
            // can be garbage collected even if someone holds onto this QuickJS object.
            this._global = null;
            this._undefined = null;
            this._null = null;
            this._true = null;
            this._false = null;
            this._ownedHandles.clear();
            this.hostCallbacks.clear();
            this.exports = null;
            this.instance = null;
            this.module = null;
        }
    }
    /**
     * Support for `using` declarations (Explicit Resource Management).
     * Automatically disposes the VM when it goes out of scope.
     *
     * ```typescript
     * using vm = await QuickJS.create(wasmBytes);
     * vm.evalCode('1 + 2');
     * // vm is automatically disposed here
     * ```
     */
    [Symbol.dispose]() {
        this.dispose();
    }
    assertNotDisposed() {
        if (this.disposed) {
            throw new Error('QuickJS instance has been disposed');
        }
    }
    // ---- Internal accessors for JSValueHandle ----
    /** @internal */
    _getExports() {
        return this.exports;
    }
    /** @internal */
    _getMemory() {
        return this.exports.memory;
    }
    /** @internal */
    _writeString(str) {
        return this.writeString(str);
    }
    /** @internal */
    _readCString(ptr) {
        return this.readCString(ptr);
    }
}
// ---- JSException ----
/**
 * An exception thrown from QuickJS code. Extends `Error` so it works with
 * standard error handling (`instanceof Error`, `.message`, `.stack`), and
 * also exposes a `handle` property — a live `JSValueHandle` to the QuickJS
 * exception value, allowing direct inspection of custom properties.
 *
 * The `handle` must be disposed when you're done with it (or use `using`).
 * If the error propagates uncaught, the handle will be cleaned up when the
 * VM is disposed.
 */
export class JSException extends Error {
    /**
     * A live handle to the QuickJS exception value. You can read custom
     * properties, call methods, etc. Must be disposed when done.
     */
    handle;
    // Cached values so they survive handle disposal / VM teardown.
    // Using # fields keeps them out of console.log / Object.keys output.
    #name;
    #message;
    #stack;
    /** @internal */
    constructor(handle) {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            super();
            this.handle = handle;
            // V8 installs a lazy `stack` accessor on Error instances that shadows
            // our prototype getter. Delete it so our getter takes effect.
            delete this.stack;
            // Read error properties eagerly and cache them.
            const msgHandle = __addDisposableResource(env_1, handle.getProp('message'), false);
            this.#name = handle.getProp('name').consume(h => h.isUndefined ? 'Error' : h.toString());
            this.#message = msgHandle.isUndefined ? handle.toString() : msgHandle.toString();
            this.#stack = handle.getProp('stack').consume(h => h.isUndefined ? undefined : h.toString());
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    }
    get name() {
        return this.#name;
    }
    set name(v) {
        this.#name = v;
    }
    get message() {
        return this.#message;
    }
    set message(v) {
        this.#message = v;
    }
    get stack() {
        return this.#stack;
    }
    set stack(v) {
        this.#stack = v;
    }
    dispose() {
        this.handle.dispose();
    }
    [Symbol.dispose]() {
        this.handle.dispose();
    }
}
// ---- JSValue Handle ----
/**
 * A handle to a JSValue inside the QuickJS WASM instance.
 */
export class JSValueHandle {
    /** The QuickJS VM instance this handle belongs to. */
    vm;
    /** @internal */
    ptr;
    disposed = false;
    constructor(vm, ptr) {
        this.vm = vm;
        this.ptr = ptr;
    }
    get isUndefined() {
        return this.vm._getExports().qjs_is_undefined(this.ptr) !== 0;
    }
    get isNull() {
        return this.vm._getExports().qjs_is_null(this.ptr) !== 0;
    }
    /**
     * Get the promise state: 0 = pending, 1 = fulfilled, 2 = rejected
     */
    get isBool() {
        return this.vm._getExports().qjs_is_bool(this.ptr) !== 0;
    }
    get isNumber() {
        return this.vm._getExports().qjs_is_number(this.ptr) !== 0;
    }
    get isString() {
        return this.vm._getExports().qjs_is_string(this.ptr) !== 0;
    }
    get isSymbol() {
        return this.vm._getExports().qjs_is_symbol(this.ptr) !== 0;
    }
    get isBigInt() {
        return this.vm._getExports().qjs_is_big_int(this.ptr) !== 0;
    }
    get isObject() {
        return this.vm._getExports().qjs_is_object(this.ptr) !== 0;
    }
    get isArray() {
        return this.vm._getExports().qjs_is_array(this.ptr) !== 0;
    }
    get isFunction() {
        return this.vm._getExports().qjs_is_function(this.ptr) !== 0;
    }
    get isError() {
        return this.vm._getExports().qjs_is_error(this.ptr) !== 0;
    }
    get isPromise() {
        return this.vm._getExports().qjs_is_promise(this.ptr) !== 0;
    }
    get isArrayBuffer() {
        return this.vm._getExports().qjs_is_array_buffer(this.ptr) !== 0;
    }
    get promiseState() {
        return this.vm._getExports().qjs_promise_state(this.ptr);
    }
    /**
     * Get the typeof this value as a string.
     * Returns the same values as the native `typeof` operator.
     */
    get typeof() {
        return this.vm.typeof(this);
    }
    /**
     * Get the length property of this value (for arrays, strings, etc.).
     */
    get length() {
        const h = this.getProp('length');
        const n = h.toNumber();
        h.dispose();
        return n;
    }
    /**
     * Get the constructor name of this object, or undefined if unavailable.
     */
    get constructorName() {
        const ctor = this.getProp('constructor');
        if (ctor.isUndefined || ctor.isNull) {
            ctor.dispose();
            return undefined;
        }
        const name = ctor.getProp('name');
        ctor.dispose();
        if (name.isUndefined || name.isNull) {
            name.dispose();
            return undefined;
        }
        const result = name.toString();
        name.dispose();
        return result;
    }
    /**
     * Get the own enumerable string property names (equivalent to Object.keys()).
     */
    keys() {
        const e = this.vm._getExports();
        const keysPtr = e.qjs_get_own_property_names(this.ptr);
        const keysHandle = new JSValueHandle(this.vm, keysPtr);
        if (e.qjs_is_exception(keysHandle.ptr) !== 0) {
            keysHandle.dispose();
            return [];
        }
        const lenHandle = keysHandle.getProp('length');
        const len = e.qjs_get_float64(lenHandle.ptr);
        lenHandle.dispose();
        const result = [];
        for (let i = 0; i < len; i++) {
            const keyPtr = e.qjs_get_prop_uint32(keysHandle.ptr, i);
            const keyHandle = new JSValueHandle(this.vm, keyPtr);
            result.push(keyHandle.toString());
            keyHandle.dispose();
        }
        keysHandle.dispose();
        return result;
    }
    /**
     * Get all own property names including non-enumerable ones
     * (equivalent to Object.getOwnPropertyNames()).
     */
    getOwnPropertyNames() {
        const e = this.vm._getExports();
        const keysPtr = e.qjs_get_own_property_names_all(this.ptr);
        const keysHandle = new JSValueHandle(this.vm, keysPtr);
        if (e.qjs_is_exception(keysHandle.ptr) !== 0) {
            keysHandle.dispose();
            return [];
        }
        const lenHandle = keysHandle.getProp('length');
        const len = e.qjs_get_float64(lenHandle.ptr);
        lenHandle.dispose();
        const result = [];
        for (let i = 0; i < len; i++) {
            const keyPtr = e.qjs_get_prop_uint32(keysHandle.ptr, i);
            const keyHandle = new JSValueHandle(this.vm, keyPtr);
            result.push(keyHandle.toString());
            keyHandle.dispose();
        }
        keysHandle.dispose();
        return result;
    }
    /**
     * Check if a property is an own property (equivalent to Object.prototype.hasOwnProperty).
     */
    hasOwnProperty(name) {
        const { ptr: namePtr } = this.vm._writeString(name);
        const result = this.vm._getExports().qjs_has_own_property(this.ptr, namePtr);
        this.vm._getExports().wasm_free(namePtr);
        return result === 1;
    }
    /**
     * Check if a property is enumerable (equivalent to Object.prototype.propertyIsEnumerable).
     */
    propertyIsEnumerable(name) {
        const { ptr: namePtr } = this.vm._writeString(name);
        const result = this.vm._getExports().qjs_property_is_enumerable(this.ptr, namePtr);
        this.vm._getExports().wasm_free(namePtr);
        return result === 1;
    }
    /**
     * Get the prototype of this object (equivalent to Object.getPrototypeOf()).
     */
    getPrototypeOf() {
        const protoPtr = this.vm._getExports().qjs_get_prototype_of(this.ptr);
        return new JSValueHandle(this.vm, protoPtr);
    }
    /**
     * Get a property by name.
     */
    getProp(name) {
        const { ptr: namePtr } = this.vm._writeString(name);
        const resultPtr = this.vm._getExports().qjs_get_prop_string(this.ptr, namePtr);
        this.vm._getExports().wasm_free(namePtr);
        return new JSValueHandle(this.vm, resultPtr);
    }
    /**
     * Set a property by name.
     */
    setProp(name, value) {
        const { ptr: namePtr } = this.vm._writeString(name);
        this.vm._getExports().qjs_set_prop_string(this.ptr, namePtr, value.ptr);
        this.vm._getExports().wasm_free(namePtr);
    }
    /**
     * Define a property with explicit property descriptor flags.
     * Unlike `setProp`, this allows controlling `writable`, `enumerable`, and
     * `configurable` attributes, matching `Object.defineProperty()` semantics.
     * Accepts string or JSValueHandle as key (JSValueHandle keys support symbols).
     *
     * All flags default to `false` when not specified.
     */
    defineProp(key, value, descriptor) {
        let flags = 0;
        if (descriptor?.configurable)
            flags |= 1; // JS_PROP_CONFIGURABLE
        if (descriptor?.writable)
            flags |= 2; // JS_PROP_WRITABLE
        if (descriptor?.enumerable)
            flags |= 4; // JS_PROP_ENUMERABLE
        if (typeof key === 'string') {
            const { ptr: namePtr } = this.vm._writeString(key);
            this.vm._getExports().qjs_define_prop_string(this.ptr, namePtr, value.ptr, flags);
            this.vm._getExports().wasm_free(namePtr);
        }
        else {
            this.vm._getExports().qjs_define_prop_value(this.ptr, key.ptr, value.ptr, flags);
        }
    }
    /**
     * Extract the value as a number.
     */
    toNumber() {
        return this.vm._getExports().qjs_get_float64(this.ptr);
    }
    /**
     * Extract the value as a BigInt.
     */
    toBigInt() {
        const e = this.vm._getExports();
        const loPtr = e.wasm_malloc(4);
        const hiPtr = e.wasm_malloc(4);
        const ret = e.qjs_get_big_int64(this.ptr, loPtr, hiPtr);
        if (ret !== 0) {
            e.wasm_free(loPtr);
            e.wasm_free(hiPtr);
            throw new Error('Failed to convert value to BigInt');
        }
        const view = new DataView(e.memory.buffer);
        const lo = view.getUint32(loPtr, true);
        const hi = view.getInt32(hiPtr, true); // signed for the high word
        e.wasm_free(loPtr);
        e.wasm_free(hiPtr);
        return (BigInt(hi) << 32n) | BigInt(lo);
    }
    /**
     * Extract the value as an ArrayBuffer (copies from WASM memory).
     * Works on ArrayBuffer values. For typed arrays, gets the underlying buffer.
     */
    toArrayBuffer() {
        const e = this.vm._getExports();
        const lenOutPtr = e.wasm_malloc(4);
        if (e.qjs_is_array_buffer(this.ptr)) {
            const dataPtr = e.qjs_get_array_buffer(this.ptr, lenOutPtr);
            if (dataPtr === 0) {
                e.wasm_free(lenOutPtr);
                throw new Error('Failed to get ArrayBuffer data');
            }
            const view = new DataView(e.memory.buffer);
            const len = view.getUint32(lenOutPtr, true);
            e.wasm_free(lenOutPtr);
            // Copy out of WASM memory
            return new Uint8Array(e.memory.buffer, dataPtr, len).slice().buffer;
        }
        // Try typed array → underlying ArrayBuffer
        e.wasm_free(lenOutPtr);
        const byteOffsetPtr = e.wasm_malloc(4);
        const byteLengthPtr = e.wasm_malloc(4);
        const bytesPerElemPtr = e.wasm_malloc(4);
        const abPtr = e.qjs_get_typed_array_buffer(this.ptr, byteOffsetPtr, byteLengthPtr, bytesPerElemPtr);
        const abHandle = new JSValueHandle(this.vm, abPtr);
        if (this.vm._getExports().qjs_is_exception(abHandle.ptr) !== 0) {
            abHandle.dispose();
            e.wasm_free(byteOffsetPtr);
            e.wasm_free(byteLengthPtr);
            e.wasm_free(bytesPerElemPtr);
            throw new Error('Value is not an ArrayBuffer or typed array');
        }
        const view = new DataView(e.memory.buffer);
        const byteOffset = view.getUint32(byteOffsetPtr, true);
        const byteLength = view.getUint32(byteLengthPtr, true);
        e.wasm_free(byteOffsetPtr);
        e.wasm_free(byteLengthPtr);
        e.wasm_free(bytesPerElemPtr);
        // Get the raw data from the underlying ArrayBuffer
        const abLenPtr = e.wasm_malloc(4);
        const abDataPtr = e.qjs_get_array_buffer(abHandle.ptr, abLenPtr);
        e.wasm_free(abLenPtr);
        abHandle.dispose();
        if (abDataPtr === 0) {
            throw new Error('Failed to get ArrayBuffer data from typed array');
        }
        // Copy the relevant slice out of WASM memory
        return new Uint8Array(e.memory.buffer, abDataPtr + byteOffset, byteLength).slice().buffer;
    }
    /**
     * Extract the value as a Uint8Array (copies from WASM memory).
     * Works on Uint8Array, ArrayBuffer, and other typed array values.
     */
    toUint8Array() {
        return new Uint8Array(this.toArrayBuffer());
    }
    /**
     * Extract the value as a string (calls JS_ToCString - works on any value).
     */
    toString() {
        const cstrPtr = this.vm._getExports().qjs_get_string(this.ptr);
        if (cstrPtr === 0)
            return '<null>';
        const str = this.vm._readCString(cstrPtr);
        this.vm._getExports().qjs_free_cstring(cstrPtr);
        return str;
    }
    /**
     * Use this handle, then dispose it. Returns the callback's return value.
     */
    consume(fn) {
        try {
            return fn(this);
        }
        finally {
            this.dispose();
        }
    }
    /**
     * Duplicate this handle (increment refcount).
     */
    dup() {
        return new JSValueHandle(this.vm, this.vm._getExports().qjs_dup_value(this.ptr));
    }
    /**
     * Dispose this handle, freeing the heap-allocated JSValue.
     * Safe to call after the VM has been disposed (becomes a no-op).
     */
    dispose() {
        if (!this.disposed) {
            this.disposed = true;
            // If the VM is already disposed, the WASM instance is gone —
            // no need to (and we can't) call qjs_free_value.
            const exports = this.vm._getExports();
            if (exports) {
                exports.qjs_free_value(this.ptr);
            }
        }
    }
    /**
     * Support for `using` declarations (Explicit Resource Management).
     * Automatically disposes the handle when it goes out of scope.
     *
     * ```typescript
     * using result = vm.evalCode('1 + 2');
     * console.log(result.toNumber()); // 3
     * // result is automatically disposed here
     * ```
     */
    [Symbol.dispose]() {
        this.dispose();
    }
}
//# sourceMappingURL=index.js.map