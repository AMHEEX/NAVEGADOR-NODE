"use strict";
//#region rolldown:runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
const fs = __toESM(require("fs"));
const events = __toESM(require("events"));
const minimatch = __toESM(require("minimatch"));
const path = __toESM(require("path"));

//#region src/index.ts
function readdir(dir, strict) {
	return new Promise((resolve$1, reject) => {
		fs.readdir(dir, { withFileTypes: true }, (err, files) => {
			if (err) switch (err.code) {
				case "ENOTDIR":
					if (strict) reject(err);
else resolve$1([]);
					break;
				case "ENOTSUP":
				case "ENOENT":
				case "ENAMETOOLONG":
				case "UNKNOWN":
					resolve$1([]);
					break;
				case "ELOOP":
				default:
					reject(err);
					break;
			}
else resolve$1(files);
		});
	});
}
function getStat(file, followSymlinks) {
	return new Promise((resolve$1) => {
		const statFunc = followSymlinks ? fs.stat : fs.lstat;
		statFunc(file, (err, stats) => {
			if (err) switch (err.code) {
				case "ENOENT":
					if (followSymlinks) resolve$1(getStat(file, false));
else resolve$1(null);
					break;
				default:
					resolve$1(null);
					break;
			}
else resolve$1(stats);
		});
	});
}
async function* exploreWalkAsync(dir, path$1, followSymlinks, useStat, shouldSkip, strict) {
	let files = await readdir(path$1 + dir, strict);
	for (const file of files) {
		let name = file.name;
		const filename = dir + "/" + name;
		const relative = filename.slice(1);
		const absolute = path$1 + "/" + relative;
		let stat = file;
		if (useStat || followSymlinks) stat = await getStat(absolute, followSymlinks) ?? stat;
		if (stat.isDirectory()) {
			if (!shouldSkip(relative)) {
				yield {
					relative,
					absolute,
					stat
				};
				yield* exploreWalkAsync(filename, path$1, followSymlinks, useStat, shouldSkip, false);
			}
		} else yield {
			relative,
			absolute,
			stat
		};
	}
}
async function* explore(path$1, followSymlinks, useStat, shouldSkip) {
	yield* exploreWalkAsync("", path$1, followSymlinks, useStat, shouldSkip, true);
}
function readOptions(options) {
	return {
		pattern: options.pattern,
		dot: !!options.dot,
		noglobstar: !!options.noglobstar,
		matchBase: !!options.matchBase,
		nocase: !!options.nocase,
		ignore: options.ignore,
		skip: options.skip,
		follow: !!options.follow,
		stat: !!options.stat,
		nodir: !!options.nodir,
		mark: !!options.mark,
		silent: !!options.silent,
		absolute: !!options.absolute
	};
}
var ReaddirGlob = class extends events.EventEmitter {
	options;
	matchers;
	ignoreMatchers;
	skipMatchers;
	paused;
	aborted;
	inactive;
	iterator;
	constructor(cwd, options, cb) {
		super();
		if (typeof options === "function") {
			cb = options;
			options = undefined;
		}
		this.options = readOptions(options || {});
		this.matchers = [];
		if (this.options.pattern) {
			const matchers = Array.isArray(this.options.pattern) ? this.options.pattern : [this.options.pattern];
			this.matchers = matchers.map((m) => new minimatch.Minimatch(m, {
				dot: this.options.dot,
				noglobstar: this.options.noglobstar,
				matchBase: this.options.matchBase,
				nocase: this.options.nocase
			}));
		}
		this.ignoreMatchers = [];
		if (this.options.ignore) {
			const ignorePatterns = Array.isArray(this.options.ignore) ? this.options.ignore : [this.options.ignore];
			this.ignoreMatchers = ignorePatterns.map((ignore) => new minimatch.Minimatch(ignore, { dot: true }));
		}
		this.skipMatchers = [];
		if (this.options.skip) {
			const skipPatterns = Array.isArray(this.options.skip) ? this.options.skip : [this.options.skip];
			this.skipMatchers = skipPatterns.map((skip) => new minimatch.Minimatch(skip, { dot: true }));
		}
		this.iterator = explore((0, path.resolve)(cwd || "."), this.options.follow, this.options.stat, this._shouldSkipDirectory.bind(this));
		this.paused = false;
		this.inactive = false;
		this.aborted = false;
		if (cb) {
			const nonNullCb = cb;
			const matches = [];
			this.on("match", (match) => matches.push(this.options.absolute ? match.absolute : match.relative));
			this.on("error", (err) => nonNullCb(err));
			this.on("end", () => nonNullCb(null, matches));
		}
		setTimeout(() => this._next());
	}
	_shouldSkipDirectory(relative) {
		return this.skipMatchers.some((m) => m.match(relative));
	}
	_fileMatches(relative, isDirectory) {
		const file = relative + (isDirectory ? "/" : "");
		return (this.matchers.length === 0 || this.matchers.some((m) => m.match(file))) && !this.ignoreMatchers.some((m) => m.match(file)) && (!this.options.nodir || !isDirectory);
	}
	_next() {
		if (!this.paused && !this.aborted) this.iterator.next().then((obj) => {
			if (!obj.done) {
				const isDirectory = obj.value.stat.isDirectory();
				if (this._fileMatches(obj.value.relative, isDirectory)) {
					let relative = obj.value.relative;
					let absolute = obj.value.absolute;
					if (this.options.mark && isDirectory) {
						relative += "/";
						absolute += "/";
					}
					if (this.options.stat) this.emit("match", {
						relative,
						absolute,
						stat: obj.value.stat
					});
else this.emit("match", {
						relative,
						absolute
					});
				}
				this._next();
			} else this.emit("end");
		}).catch((err) => {
			this.abort();
			this.emit("error", err);
			if (!err.code && !this.options.silent) console.error(err);
		});
else this.inactive = true;
	}
	abort() {
		this.aborted = true;
	}
	pause() {
		this.paused = true;
	}
	resume() {
		this.paused = false;
		if (this.inactive) {
			this.inactive = false;
			this._next();
		}
	}
};
const readdirGlob = (pattern, options, cb) => new ReaddirGlob(pattern, options, cb);
readdirGlob.ReaddirGlob = ReaddirGlob;
var src_default = readdirGlob;

//#endregion
//#region src/cjs.ts
var cjs_default = src_default;

//#endregion
module.exports = cjs_default;
//# sourceMappingURL=index.js.map