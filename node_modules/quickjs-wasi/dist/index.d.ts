/**
 * QuickJS WASM - A snapshotable JavaScript runtime via WebAssembly.
 *
 * Provides a clean JavaScript API for running sandboxed JS code in a QuickJS
 * VM compiled to WASM. The key differentiator is the ability to snapshot the
 * entire VM state (including pending promises) and restore it in a fresh
 * WASM instance.
 */
import { type WasiOptions } from './wasi-shim.js';
import { type ExtensionDescriptor } from './extensions.js';
export type HostFunction = (this: JSValueHandle, ...args: JSValueHandle[]) => JSValueHandle;
/** Property descriptor flags for `defineProp()`. */
export interface JSPropertyDescriptor {
    writable?: boolean;
    enumerable?: boolean;
    configurable?: boolean;
}
export type { WasiOptions };
export type { ExtensionDescriptor, LoadedExtension, DylinkInfo, WasiImports } from './extensions.js';
/**
 * Flags for `evalCode()`, matching the QuickJS `JS_EVAL_*` constants.
 */
export declare const EvalFlags: {
    /** Global script mode (default). */
    readonly TYPE_GLOBAL: 0;
    /** Module mode. */
    readonly TYPE_MODULE: 1;
    /** Force strict mode. */
    readonly STRICT: 8;
    /** Compile only — do not execute. */
    readonly COMPILE_ONLY: 32;
    /** Omit stack frames before this eval from Error backtraces. */
    readonly BACKTRACE_BARRIER: 64;
    /**
     * Allow top-level `await` in global scripts. When used, `evalCode()`
     * returns a handle to a Promise that resolves to the completion value.
     * Use together with `executePendingJobs()` and `resolvePromise()`.
     */
    readonly ASYNC: 128;
};
/**
 * Flags for `vm.compile()` controlling what is included in the bytecode output.
 * These can be combined with bitwise OR.
 */
export declare const CompileFlags: {
    /** Strip source code from the bytecode (smaller output, no source in errors). */
    readonly STRIP_SOURCE: 16;
    /** Strip debug information (line numbers, etc.) from the bytecode. */
    readonly STRIP_DEBUG: 32;
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
export declare const Intrinsics: {
    /** `Date` constructor and prototype methods. */
    readonly DATE: 1;
    /** `eval()` and `Function()` constructor. */
    readonly EVAL: 2;
    /** `RegExp` constructor, prototype methods, and regex literals. */
    readonly REGEXP: 4;
    /** `JSON.parse()` and `JSON.stringify()`. */
    readonly JSON: 8;
    /** `Proxy` and `Reflect`. */
    readonly PROXY: 16;
    /** `Map`, `Set`, `WeakMap`, `WeakSet`. */
    readonly MAP_SET: 32;
    /** `ArrayBuffer`, `TypedArray` variants, `DataView`. */
    readonly TYPED_ARRAYS: 64;
    /** `Promise`, `async`/`await`. */
    readonly PROMISE: 128;
    /** `BigInt`. Note: BigInt is part of BaseObjects in quickjs-ng and cannot be fully removed. */
    readonly BIG_INT: 256;
    /** `WeakRef` and `FinalizationRegistry`. */
    readonly WEAK_REF: 512;
    /** `performance.now()`. */
    readonly PERFORMANCE: 1024;
    /** `DOMException` class. */
    readonly DOM_EXCEPTION: 2048;
    /** All intrinsics enabled (default). */
    readonly ALL: 4294967295;
};
/** Memory usage statistics from the QuickJS runtime. */
export interface MemoryUsage {
    /** Total bytes allocated via malloc */
    mallocSize: number;
    /** Current malloc limit (0 for unlimited) */
    mallocLimit: number;
    /** Total memory used (including overhead) */
    memoryUsedSize: number;
    /** Number of malloc calls */
    mallocCount: number;
    /** Number of memory-using objects */
    memoryUsedCount: number;
    /** Number of atoms */
    atomCount: number;
    /** Atom memory size */
    atomSize: number;
    /** Number of strings */
    strCount: number;
    /** String memory size */
    strSize: number;
    /** Number of objects */
    objCount: number;
    /** Object memory size */
    objSize: number;
    /** Number of properties */
    propCount: number;
    /** Property memory size */
    propSize: number;
    /** Number of shapes */
    shapeCount: number;
    /** Shape memory size */
    shapeSize: number;
    /** Number of JS functions */
    jsFuncCount: number;
    /** JS function memory size */
    jsFuncSize: number;
    /** JS function code size */
    jsFuncCodeSize: number;
    /** Number of PC-to-line mappings */
    jsFuncPc2lineCount: number;
    /** PC-to-line mapping memory size */
    jsFuncPc2lineSize: number;
    /** Number of C functions */
    cFuncCount: number;
    /** Number of arrays */
    arrayCount: number;
    /** Number of fast arrays */
    fastArrayCount: number;
    /** Number of fast array elements */
    fastArrayElements: number;
    /** Number of binary objects (ArrayBuffer, etc.) */
    binaryObjectCount: number;
    /** Binary object memory size */
    binaryObjectSize: number;
}
export interface QuickJSOptions {
    /** WASM module bytes or pre-compiled module. If omitted, loads from the package. */
    wasm?: BufferSource | WebAssembly.Module;
    /** Custom WASI function implementations. */
    wasi?: WasiOptions;
    /**
     * Maximum memory the QuickJS runtime can allocate, in bytes.
     * When exceeded, allocations fail and surface as JS exceptions
     * (e.g. `InternalError: out of memory`).
     */
    memoryLimit?: number;
    /**
     * Called periodically during JS execution. Return `true` to interrupt
     * the current execution with an `InternalError: interrupted` exception.
     * Useful for implementing execution timeouts or step limits.
     *
     * The handler is called approximately once per JS bytecode instruction,
     * so it should be fast.
     */
    interruptHandler?: () => boolean;
    /**
     * Called when a promise is rejected without a handler, or when a handler
     * is attached to a previously unhandled rejection.
     *
     * @param promise - The rejected promise
     * @param reason - The rejection reason/value
     * @param isHandled - `true` if a handler was just attached (previously unhandled),
     *   `false` if this is a new unhandled rejection
     *
     * Both `promise` and `reason` handles are owned by the caller and will be
     * disposed automatically after the callback returns.
     */
    onUnhandledRejection?: (promise: JSValueHandle, reason: JSValueHandle, isHandled: boolean) => void;
    /**
     * Module loader for ES module `import` statements. When provided, the VM
     * can resolve and load modules.
     *
     * Both callbacks are **synchronous** — they must return their result
     * immediately. For async module resolution, pre-fetch all module sources
     * before creating the VM and return them from a `Map` in the `load` callback.
     */
    moduleLoader?: {
        /**
         * Resolve a module specifier relative to the importing module.
         * Called when an `import` statement is encountered.
         *
         * @param baseName - The name of the module containing the `import` statement
         * @param specifier - The raw specifier string (e.g. `"./foo.js"`, `"lodash"`)
         * @returns The normalized/canonical module name
         *
         * If omitted, specifiers are passed through to `load` unchanged.
         */
        normalize?: (baseName: string, specifier: string) => string;
        /**
         * Load the source code for a module.
         *
         * @param moduleName - The normalized module name (from `normalize`, or the raw specifier)
         * @returns The module source code as a string
         */
        load: (moduleName: string) => string;
    };
    /**
     * Bitmask of `Intrinsics.*` flags controlling which built-in JavaScript
     * features are available. By default all intrinsics are enabled.
     *
     * Example: Create a VM without `eval()` or `Proxy`:
     * ```ts
     * const vm = await QuickJS.create({
     *   intrinsics: Intrinsics.ALL & ~Intrinsics.EVAL & ~Intrinsics.PROXY,
     * });
     * ```
     */
    intrinsics?: number;
    /**
     * Native WASM extensions to load. Each extension is a WASM shared library
     * (.so) compiled with wasi-sdk that links against the QuickJS C API.
     *
     * Extensions are loaded in order and their init functions are called
     * after the QuickJS runtime is initialized. The same extensions (in the
     * same order) must be provided when restoring from a snapshot.
     */
    extensions?: ExtensionDescriptor[];
    /**
     * Controls the timezone offset used by `Date` within the QuickJS sandbox.
     *
     * - **`'host'`** (default): mirrors the host environment's timezone.
     *   `new Date().getTimezoneOffset()` inside the VM will match the host.
     * - **A number**: a fixed UTC offset in **minutes** (e.g. `-480` for UTC-8,
     *   `60` for UTC+1). Note: this follows the `getTimezoneOffset()` sign
     *   convention where *west* of UTC is positive.
     * - **A callback `(time: number) => number`**: called with seconds since
     *   epoch, must return the UTC offset in minutes for that instant. Useful
     *   for DST-aware custom timezone logic. The callback is invoked whenever
     *   QuickJS converts between UTC and local time (e.g. `getHours()`,
     *   `toString()`, `getTimezoneOffset()`), so it may be called multiple
     *   times per Date operation.
     */
    timezoneOffset?: 'host' | number | ((timeSecs: number) => number);
}
interface QuickJSExports {
    memory: WebAssembly.Memory;
    __stack_pointer: WebAssembly.Global;
    __indirect_function_table: WebAssembly.Table;
    _initialize(): void;
    qjs_get_quickjs_version(): number;
    qjs_init(): number;
    qjs_init2(intrinsics: number): number;
    qjs_destroy(): void;
    qjs_eval(codePtr: number, codeLen: number, filenamePtr: number, flags: number): number;
    qjs_compile(codePtr: number, codeLen: number, filenamePtr: number, evalFlags: number, writeFlags: number, outLenPtr: number): number;
    qjs_eval_bytecode(bufPtr: number, bufLen: number): number;
    qjs_new_string(strPtr: number, strLen: number): number;
    qjs_new_number(num: number): number;
    qjs_new_object(): number;
    qjs_new_array(): number;
    qjs_get_undefined(): number;
    qjs_get_null(): number;
    qjs_get_true(): number;
    qjs_get_false(): number;
    qjs_new_big_int64(lo: number, hi: number): number;
    qjs_get_big_int64(valPtr: number, loOutPtr: number, hiOutPtr: number): number;
    qjs_get_float64(valPtr: number): number;
    qjs_get_string(valPtr: number): number;
    qjs_free_cstring(strPtr: number): void;
    qjs_typeof(valPtr: number): number;
    qjs_is_exception(valPtr: number): number;
    qjs_is_undefined(valPtr: number): number;
    qjs_is_null(valPtr: number): number;
    qjs_is_bool(valPtr: number): number;
    qjs_is_number(valPtr: number): number;
    qjs_is_string(valPtr: number): number;
    qjs_is_object(valPtr: number): number;
    qjs_is_array(valPtr: number): number;
    qjs_is_function(valPtr: number): number;
    qjs_is_error(valPtr: number): number;
    qjs_is_promise(valPtr: number): number;
    qjs_is_symbol(valPtr: number): number;
    qjs_is_big_int(valPtr: number): number;
    qjs_is_array_buffer(valPtr: number): number;
    qjs_get_bool(valPtr: number): number;
    qjs_new_symbol(descPtr: number, descLen: number, isGlobal: number): number;
    qjs_get_symbol_description(valPtr: number, descOutPtr: number): number;
    qjs_get_prop_value(objPtr: number, keyPtr: number): number;
    qjs_set_prop_value(objPtr: number, keyPtr: number, valPtr: number): number;
    qjs_new_array_buffer(dataPtr: number, len: number): number;
    qjs_get_array_buffer(valPtr: number, lenOutPtr: number): number;
    qjs_new_uint8_array(dataPtr: number, len: number): number;
    qjs_get_typed_array_buffer(valPtr: number, byteOffsetOutPtr: number, byteLengthOutPtr: number, bytesPerElementOutPtr: number): number;
    qjs_dup_value(valPtr: number): number;
    qjs_free_value(valPtr: number): void;
    qjs_get_global(): number;
    qjs_get_prop_string(objPtr: number, namePtr: number): number;
    qjs_set_prop_string(objPtr: number, namePtr: number, valPtr: number): number;
    qjs_define_prop_string(objPtr: number, namePtr: number, valPtr: number, flags: number): number;
    qjs_define_prop_value(objPtr: number, keyPtr: number, valPtr: number, flags: number): number;
    qjs_get_prop_uint32(objPtr: number, idx: number): number;
    qjs_set_prop_uint32(objPtr: number, idx: number, valPtr: number): number;
    qjs_get_own_property_names(objPtr: number): number;
    qjs_get_own_property_names_all(objPtr: number): number;
    qjs_has_own_property(objPtr: number, namePtr: number): number;
    qjs_property_is_enumerable(objPtr: number, namePtr: number): number;
    qjs_get_prototype_of(objPtr: number): number;
    qjs_get_value_ptr(valPtr: number): number;
    qjs_call(funcPtr: number, thisPtr: number, argc: number, argvPtr: number): number;
    qjs_new_host_function(namePtr: number, nameLen: number, argCount: number): number;
    qjs_new_promise(resolveOutPtr: number, rejectOutPtr: number): number;
    qjs_promise_state(promisePtr: number): number;
    qjs_promise_result(promisePtr: number): number;
    qjs_is_job_pending(): number;
    qjs_execute_pending_job(): number;
    qjs_get_exception(): number;
    qjs_new_error(): number;
    qjs_throw(valPtr: number): number;
    qjs_set_memory_limit(limit: number): void;
    qjs_set_max_stack_size(size: number): void;
    qjs_set_interrupt_handler(enable: number): void;
    qjs_set_promise_rejection_handler(enable: number): void;
    qjs_set_module_loader(enable: number): void;
    qjs_run_gc(): void;
    qjs_set_gc_threshold(threshold: number): void;
    qjs_get_gc_threshold(): number;
    qjs_compute_memory_usage(outPtr: number): void;
    qjs_get_runtime_ptr(): number;
    qjs_get_context_ptr(): number;
    qjs_set_runtime_and_context(rtPtr: number, ctxPtr: number): void;
    malloc(size: number): number;
    free(ptr: number): void;
    wasm_malloc(size: number): number;
    wasm_free(ptr: number): void;
}
/** Metadata about an extension saved in a snapshot */
export interface SnapshotExtension {
    name: string;
    memoryBase: number;
    tableBase: number;
    initFn: string;
}
export interface Snapshot {
    /** The raw WASM linear memory contents */
    memory: Uint8Array;
    /** The stack pointer value at snapshot time */
    stackPointer: number;
    /** Pointer to JSRuntime in the WASM memory */
    runtimePtr: number;
    /** Pointer to JSContext in the WASM memory */
    contextPtr: number;
    /** Metadata about loaded extensions (empty if none) */
    extensions: SnapshotExtension[];
}
export interface Deferred {
    /** Handle to the QuickJS promise object */
    handle: JSValueHandle;
    /** A host-side Promise that resolves when the QuickJS promise settles */
    settled: Promise<void>;
    /** Resolve the QuickJS promise with a value */
    resolve(value: JSValueHandle): void;
    /** Reject the QuickJS promise with a value */
    reject(value: JSValueHandle): void;
}
export declare class QuickJS {
    private exports;
    private module;
    private instance;
    private encoder;
    private decoder;
    private disposed;
    /** Registry of host callbacks, keyed by function name */
    private hostCallbacks;
    /** Counter for internal-only callbacks (e.g. promise settle handlers) */
    private nextInternalId;
    private interruptHandler;
    private unhandledRejectionHandler;
    private moduleNormalizeHandler;
    private moduleLoadHandler;
    private timezoneOffsetHandler;
    private _global;
    private _versions;
    private _undefined;
    private _null;
    private _true;
    private _false;
    private _ownedHandles;
    /** Loaded extensions in deterministic order */
    private loadedExtensions;
    private constructor();
    private setInstance;
    /**
     * Version information for the runtime and loaded native libraries.
     * Always includes `"quickjs-wasi"` (the npm package version) and
     * `"quickjs"` (the QuickJS engine version). Extensions may contribute
     * additional entries for their native dependencies (e.g. `"ada"`, `"mbedtls"`).
     */
    get versions(): Record<string, string>;
    /** The global object. Cached — do not dispose. */
    get global(): JSValueHandle;
    /** The undefined value. Cached — do not dispose. */
    get undefined(): JSValueHandle;
    /** The null value. Cached — do not dispose. */
    get null(): JSValueHandle;
    /** The true value. Cached — do not dispose. */
    get true(): JSValueHandle;
    /** The false value. Cached — do not dispose. */
    get false(): JSValueHandle;
    /**
     * Create a fresh QuickJS VM instance.
     *
     * @param options - Optional configuration. Can also pass raw WASM bytes
     *                  directly for backwards compatibility.
     */
    static create(options?: QuickJSOptions | BufferSource | WebAssembly.Module): Promise<QuickJS>;
    /**
     * Restore a QuickJS VM from a snapshot.
     *
     * @param snapshot - The snapshot to restore from.
     * @param options - Optional configuration. Can also pass raw WASM bytes
     *                  directly for backwards compatibility.
     */
    static restore(snapshot: Snapshot, options?: QuickJSOptions | BufferSource | WebAssembly.Module): Promise<QuickJS>;
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
    static serializeSnapshot(snapshot: Snapshot): Uint8Array;
    /**
     * Deserialize a snapshot from a binary buffer produced by `serializeSnapshot()`.
     */
    static deserializeSnapshot(data: Uint8Array): Snapshot;
    private static normalizeOptions;
    private static applyLimits;
    private static resolveModule;
    private static instantiate;
    /**
     * Called from WASM when a host function is invoked from QuickJS code.
     */
    private handleHostCall;
    /** Write a JS string into WASM memory, returning the pointer. Caller must free. */
    private writeString;
    /** Read a null-terminated C string from WASM memory */
    private readCString;
    /**
     * Check if a result handle is an exception and throw a JSException if so.
     * Used internally by evalCode and callFunction.
     */
    private throwIfException;
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
    evalCode(code: string, filename?: string, flags?: number): JSValueHandle;
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
    compile(code: string, filename?: string, evalFlags?: number, compileFlags?: number): Uint8Array;
    /**
     * Execute previously compiled bytecode (from `compile()`).
     * Returns the evaluation result as a handle.
     *
     * @param bytecode - The bytecode `Uint8Array` from `compile()`.
     */
    evalBytecode(bytecode: Uint8Array): JSValueHandle;
    /**
     * Execute all pending microtask jobs (promise reactions, etc.)
     * Returns the number of jobs executed.
     */
    executePendingJobs(): number;
    /**
     * Explicitly trigger garbage collection. QuickJS runs GC automatically,
     * but this can be useful to reclaim memory at a known point or before
     * taking a snapshot.
     */
    runGC(): void;
    /**
     * The GC threshold in bytes. When allocated memory exceeds this value,
     * garbage collection is triggered automatically. Set to 0 to disable
     * automatic GC.
     */
    get gcThreshold(): number;
    set gcThreshold(threshold: number);
    /**
     * Get detailed memory usage statistics from the QuickJS runtime.
     * Returns counts and sizes for atoms, strings, objects, functions, etc.
     */
    getMemoryUsage(): MemoryUsage;
    /**
     * Get the global object. Prefer the cached `vm.global` property.
     */
    getGlobal(): JSValueHandle;
    /**
     * Create a new QuickJS string value.
     */
    newString(str: string): JSValueHandle;
    /**
     * Create a new QuickJS number value.
     */
    newNumber(num: number): JSValueHandle;
    /**
     * Create a new QuickJS BigInt value.
     */
    newBigInt(val: bigint): JSValueHandle;
    /**
     * Create a new QuickJS object value.
     */
    newObject(): JSValueHandle;
    /**
     * Create a new QuickJS array value.
     */
    newArray(): JSValueHandle;
    /**
     * Create a global symbol (`Symbol.for(description)`).
     * Global symbols with the same description are always the same symbol,
     * even across snapshot/restore.
     */
    newSymbolFor(description: string): JSValueHandle;
    /**
     * Create a new QuickJS ArrayBuffer by copying data from a host buffer.
     */
    newArrayBuffer(data: ArrayBuffer | Uint8Array): JSValueHandle;
    /**
     * Create a new QuickJS Uint8Array by copying data from a host buffer.
     */
    newUint8Array(data: Uint8Array): JSValueHandle;
    /**
     * Get undefined. Prefer the cached `vm.undefined` property.
     */
    getUndefined(): JSValueHandle;
    /**
     * Get null. Prefer the cached `vm.null` property.
     */
    getNull(): JSValueHandle;
    /**
     * Get true. Prefer the cached `vm.true` property.
     */
    getTrue(): JSValueHandle;
    /**
     * Get false. Prefer the cached `vm.false` property.
     */
    getFalse(): JSValueHandle;
    /**
     * Create a new QuickJS function backed by a host callback.
     *
     * When the function is called inside QuickJS, the host callback is invoked
     * with the `this` value and arguments as JSValueHandles.
     */
    newFunction(name: string, fn: HostFunction): JSValueHandle;
    /**
     * Create an internal host function that bypasses the duplicate-name check.
     * Used for ephemeral callbacks (promise settle handlers, resolvePromise, etc.)
     * that are not intended to survive snapshot/restore.
     */
    private newInternalFunction;
    /**
     * Create a new promise.
     *
     * Returns a Deferred with:
     * - `handle` - the QuickJS promise object
     * - `settled` - a host Promise that resolves when the QuickJS promise settles
     * - `resolve(value)` - resolve the promise with a QuickJS value
     * - `reject(value)` - reject the promise with a QuickJS value
     */
    newPromise(): Deferred;
    /**
     * Resolve a promise handle. Returns a host-side Promise that resolves
     * with the settled value/error of the QuickJS promise.
     *
     * If the handle is not a promise, it is treated as an already-fulfilled value.
     *
     * The returned host Promise resolves to `{ value: JSValueHandle }` on
     * fulfillment or `{ error: JSValueHandle }` on rejection.
     */
    resolvePromise(promiseHandle: JSValueHandle): Promise<{
        value: JSValueHandle;
    } | {
        error: JSValueHandle;
    }>;
    /**
     * Call a QuickJS function. If the function throws, a `JSException`
     * is thrown on the host side.
     */
    callFunction(func: JSValueHandle, thisVal: JSValueHandle, ...args: JSValueHandle[]): JSValueHandle;
    /**
     * Internal: call a QuickJS function without throwing on exception.
     * Used by promise plumbing where exceptions are handled differently.
     */
    private callFunctionRaw;
    /**
     * Set a property on an object. Accepts string or JSValueHandle as key.
     * JSValueHandle keys support symbols (including `Symbol.for()`).
     */
    setProp(obj: JSValueHandle, key: string | JSValueHandle, value: JSValueHandle): void;
    /**
     * Define a property on an object with explicit property descriptor flags.
     * Unlike `setProp`, this allows controlling `writable`, `enumerable`, and
     * `configurable` attributes, matching `Object.defineProperty()` semantics.
     * Accepts string or JSValueHandle as key (JSValueHandle keys support symbols).
     *
     * All flags default to `false` when not specified.
     */
    defineProp(obj: JSValueHandle, key: string | JSValueHandle, value: JSValueHandle, descriptor?: JSPropertyDescriptor): void;
    /**
     * Get a property from an object using a JSValueHandle key.
     * Supports symbol keys (including `Symbol.for()`).
     */
    getProp(obj: JSValueHandle, key: JSValueHandle): JSValueHandle;
    /**
     * Get the current exception, if any.
     */
    getException(): JSValueHandle;
    /**
     * Create a new QuickJS Error object.
     * Accepts a string message or a native Error object.
     */
    newError(messageOrError: string | Error): JSValueHandle;
    /**
     * Get the typeof a handle as a string.
     */
    typeof(handle: JSValueHandle): string;
    /**
     * Convert a QuickJS handle to a host JavaScript value.
     * Handles strings, numbers, booleans, null, undefined, bigint, arrays,
     * errors, functions, and plain objects. Circular references in objects
     * are returned as `undefined`.
     */
    dump(handle: JSValueHandle): unknown;
    private _dump;
    /**
     * Convert a host JavaScript value to a QuickJS handle.
     */
    hostToHandle(value: unknown): JSValueHandle;
    /**
     * Snapshot the entire VM state.
     *
     * Returns a snapshot containing the full WASM linear memory. Use
     * `QuickJS.serializeSnapshot()` to convert to a versioned binary
     * buffer for persistent storage.
     */
    snapshot(): Snapshot;
    /**
     * Re-register a host callback after restoring from a snapshot.
     * The name must match the name passed to `newFunction()` before the snapshot.
     */
    registerHostCallback(name: string, fn: HostFunction): void;
    /**
     * Dispose the VM, releasing all references to the WASM instance
     * so it can be garbage collected by the host JS engine.
     */
    dispose(): void;
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
    [Symbol.dispose](): void;
    private assertNotDisposed;
    /** @internal */
    _getExports(): QuickJSExports;
    /** @internal */
    _getMemory(): WebAssembly.Memory;
    /** @internal */
    _writeString(str: string): {
        ptr: number;
        len: number;
    };
    /** @internal */
    _readCString(ptr: number): string;
}
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
export declare class JSException extends Error {
    #private;
    /**
     * A live handle to the QuickJS exception value. You can read custom
     * properties, call methods, etc. Must be disposed when done.
     */
    readonly handle: JSValueHandle;
    /** @internal */
    constructor(handle: JSValueHandle);
    get name(): string;
    set name(v: string);
    get message(): string;
    set message(v: string);
    get stack(): string | undefined;
    set stack(v: string | undefined);
    dispose(): void;
    [Symbol.dispose](): void;
}
/**
 * A handle to a JSValue inside the QuickJS WASM instance.
 */
export declare class JSValueHandle {
    /** The QuickJS VM instance this handle belongs to. */
    readonly vm: QuickJS;
    /** @internal */
    readonly ptr: number;
    private disposed;
    constructor(vm: QuickJS, ptr: number);
    get isUndefined(): boolean;
    get isNull(): boolean;
    /**
     * Get the promise state: 0 = pending, 1 = fulfilled, 2 = rejected
     */
    get isBool(): boolean;
    get isNumber(): boolean;
    get isString(): boolean;
    get isSymbol(): boolean;
    get isBigInt(): boolean;
    get isObject(): boolean;
    get isArray(): boolean;
    get isFunction(): boolean;
    get isError(): boolean;
    get isPromise(): boolean;
    get isArrayBuffer(): boolean;
    get promiseState(): number;
    /**
     * Get the typeof this value as a string.
     * Returns the same values as the native `typeof` operator.
     */
    get typeof(): string;
    /**
     * Get the length property of this value (for arrays, strings, etc.).
     */
    get length(): number;
    /**
     * Get the constructor name of this object, or undefined if unavailable.
     */
    get constructorName(): string | undefined;
    /**
     * Get the own enumerable string property names (equivalent to Object.keys()).
     */
    keys(): string[];
    /**
     * Get all own property names including non-enumerable ones
     * (equivalent to Object.getOwnPropertyNames()).
     */
    getOwnPropertyNames(): string[];
    /**
     * Check if a property is an own property (equivalent to Object.prototype.hasOwnProperty).
     */
    hasOwnProperty(name: string): boolean;
    /**
     * Check if a property is enumerable (equivalent to Object.prototype.propertyIsEnumerable).
     */
    propertyIsEnumerable(name: string): boolean;
    /**
     * Get the prototype of this object (equivalent to Object.getPrototypeOf()).
     */
    getPrototypeOf(): JSValueHandle;
    /**
     * Get a property by name.
     */
    getProp(name: string): JSValueHandle;
    /**
     * Set a property by name.
     */
    setProp(name: string, value: JSValueHandle): void;
    /**
     * Define a property with explicit property descriptor flags.
     * Unlike `setProp`, this allows controlling `writable`, `enumerable`, and
     * `configurable` attributes, matching `Object.defineProperty()` semantics.
     * Accepts string or JSValueHandle as key (JSValueHandle keys support symbols).
     *
     * All flags default to `false` when not specified.
     */
    defineProp(key: string | JSValueHandle, value: JSValueHandle, descriptor?: JSPropertyDescriptor): void;
    /**
     * Extract the value as a number.
     */
    toNumber(): number;
    /**
     * Extract the value as a BigInt.
     */
    toBigInt(): bigint;
    /**
     * Extract the value as an ArrayBuffer (copies from WASM memory).
     * Works on ArrayBuffer values. For typed arrays, gets the underlying buffer.
     */
    toArrayBuffer(): ArrayBuffer;
    /**
     * Extract the value as a Uint8Array (copies from WASM memory).
     * Works on Uint8Array, ArrayBuffer, and other typed array values.
     */
    toUint8Array(): Uint8Array;
    /**
     * Extract the value as a string (calls JS_ToCString - works on any value).
     */
    toString(): string;
    /**
     * Use this handle, then dispose it. Returns the callback's return value.
     */
    consume<T>(fn: (handle: JSValueHandle) => T): T;
    /**
     * Duplicate this handle (increment refcount).
     */
    dup(): JSValueHandle;
    /**
     * Dispose this handle, freeing the heap-allocated JSValue.
     * Safe to call after the VM has been disposed (becomes a no-op).
     */
    dispose(): void;
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
    [Symbol.dispose](): void;
}
//# sourceMappingURL=index.d.ts.map