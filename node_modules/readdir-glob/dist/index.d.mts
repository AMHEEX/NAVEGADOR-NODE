import * as fs from 'fs';
import { EventEmitter } from 'events';
export type Stat = fs.Dirent | fs.Stats;
export type Match = {
    relative: string;
    absolute: string;
    stat?: Stat;
};
export type Options = {
    /**
     * Glob pattern or Array of Glob patterns to match the found files with.
     * A file has to match at least one of the provided patterns to be returned.
     */
    pattern?: string | string[];
    /**
     * Allow pattern to match filenames starting with a period, even if the pattern
     * does not explicitly have a period in that spot.
     */
    dot?: boolean;
    /**
     * Disable `**` matching against multiple folder names.
     */
    noglobstar?: boolean;
    /**
     * Perform a basename-only match if the pattern does not contain any slash
     * characters. That is, `*.js` would be treated as equivalent to `**\/*.js`,
     * matching all js files in all directories.
     */
    matchBase?: boolean;
    /**
     * Perform a case-insensitive match. Note: on case-insensitive file systems,
     * non-magic patterns will match by default, since `stat` and `readdir` will
     * not raise errors.
     */
    nocase?: boolean;
    /**
     * Glob pattern or Array of Glob patterns to exclude matches. If a file or a
     * folder matches at least one of the provided patterns, it's not returned.
     * It doesn't prevent files from folder content to be returned. Note: ignore
     * patterns are always in dot:true mode.
     */
    ignore?: string | string[];
    /**
     * Glob pattern or Array of Glob patterns to exclude folders.
     * If a folder matches one of the provided patterns, it's not returned, and
     * it's not explored: this prevents any of its children to be returned.
     * Note: skip patterns are always in dot:true mode.
     */
    skip?: string | string[];
    /**
     * Follow symlinked directories. Note that requires to stat _all_ results,
     * and so reduces performance.
     */
    follow?: boolean;
    /**
     * Set to true to stat _all_ results. This reduces performance.
     */
    stat?: boolean;
    /**
     * Do not match directories, only files.
     */
    nodir?: boolean;
    /**
     * Add a `/` character to directory matches.
     */
    mark?: boolean;
    /**
     * When an unusual error is encountered when attempting to read a directory,
     * a warning will be printed to stderr. Set the `silent` option to true to
     * suppress these warnings.
     */
    silent?: boolean;
    /**
     * Absolute paths will be returned instead of relative paths.
     */
    absolute?: boolean;
};
type StrictOptions = Options & Required<Omit<Options, 'pattern' | 'ignore' | 'skip'>>;
export type Callback = (err: Error | null, matches?: readonly string[]) => void;
export declare class ReaddirGlob extends EventEmitter<{
    match: [Match];
    end: [];
    error: [NodeJS.ErrnoException];
}> {
    options: StrictOptions;
    private matchers;
    private ignoreMatchers;
    private skipMatchers;
    paused: boolean;
    aborted: boolean;
    private inactive;
    private iterator;
    constructor(cwd?: string, options?: Options | Callback, cb?: Callback);
    private _shouldSkipDirectory;
    private _fileMatches;
    private _next;
    abort(): void;
    pause(): void;
    resume(): void;
}
interface readdirGlobInterface {
    (pattern?: string, options?: Options | Callback, cb?: Callback): ReaddirGlob;
    ReaddirGlob: typeof ReaddirGlob;
}
export declare const readdirGlob: readdirGlobInterface;
export default readdirGlob;
