import * as fs from 'fs';
import { EventEmitter } from 'events';
import { Minimatch } from 'minimatch';
import { resolve } from 'path';

function readdir(dir: fs.PathLike, strict: boolean): Promise<fs.Dirent[]> {
  return new Promise((resolve, reject) => {
    fs.readdir(dir, {withFileTypes: true} ,(err, files) => {
      if(err) {
        switch (err.code) {
          case 'ENOTDIR':      // Not a directory
            if(strict) {
              reject(err);
            } else {
              resolve([]);
            }
            break;
          case 'ENOTSUP':      // Operation not supported
          case 'ENOENT':       // No such file or directory
          case 'ENAMETOOLONG': // Filename too long
          case 'UNKNOWN':
            resolve([]);
            break;
          case 'ELOOP':        // Too many levels of symbolic links
          default:
            reject(err);
            break;
        }
      } else {
        resolve(files);
      }
    });
  });
}

function getStat(file: fs.PathLike, followSymlinks: boolean): Promise<fs.Stats | null> {
  return new Promise((resolve) => {
    const statFunc = followSymlinks ? fs.stat : fs.lstat;
    statFunc(file, (err, stats) => {
      if(err) {
        switch (err.code) {
          case 'ENOENT':
            if(followSymlinks) {
              // Fallback to lstat to handle broken links as files
              resolve(getStat(file, false)); 
            } else {
              resolve(null);
            }
            break;
          default:
            resolve(null);
            break;
        }
      } else {
        resolve(stats);
      }
    });
  });
}

export type Stat = fs.Dirent | fs.Stats;
export type Match = {
  relative: string,
  absolute: string,
  stat?: Stat
};

async function* exploreWalkAsync(
  dir: string,
  path: string,
  followSymlinks: boolean,
  useStat:boolean,
  shouldSkip:(path: string) => boolean,
  strict:boolean
) : AsyncGenerator<Required<Match>> {
  let files = await readdir(path + dir, strict);
  for(const file of files) {
    let name: string = file.name;
    const filename = dir + '/' + name;
    const relative = filename.slice(1); // Remove the leading /
    const absolute = path + '/' + relative;
    let stat: Stat = file;
    if(useStat || followSymlinks) {
      stat = await getStat(absolute, followSymlinks) ?? stat;
    }
    if(stat.isDirectory()) {
      if(!shouldSkip(relative)) {
        yield {relative, absolute, stat};
        yield* exploreWalkAsync(filename, path, followSymlinks, useStat, shouldSkip, false);
      }
    } else {
      yield {relative, absolute, stat};
    }
  }
}


async function* explore(
  path: string,
  followSymlinks: boolean,
  useStat: boolean,
  shouldSkip: (path: string) => boolean
): AsyncGenerator<Required<Match>>  {
  yield* exploreWalkAsync('', path, followSymlinks, useStat, shouldSkip, true);
}


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

type StrictOptions = Options & Required<
  Omit<Options, 'pattern' | 'ignore' | 'skip'>
>;


function readOptions(options: Options) : StrictOptions {
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

export type Callback = (err: Error | null, matches?: readonly string[]) => void;

export class ReaddirGlob extends EventEmitter<{
  match: [Match],
  end: [],
  error: [NodeJS.ErrnoException]
}> {
  public options: StrictOptions;

  private matchers: Minimatch[];
  private ignoreMatchers: Minimatch[];
  private skipMatchers: Minimatch[];

  public paused: boolean;
  public aborted: boolean;
  private inactive: boolean;

  private iterator: ReturnType<typeof explore>;

  constructor(cwd?: string, options?: Options |  Callback, cb?: Callback) {
    super();
    if(typeof options === 'function') {
      cb = options;
      options = undefined;
    }

    this.options = readOptions(options || {});
  
    this.matchers = [];
    if(this.options.pattern) {
      const matchers = Array.isArray(this.options.pattern) ? this.options.pattern : [this.options.pattern];
      this.matchers = matchers.map( m =>
        new Minimatch(m, {
          dot: this.options.dot,
          noglobstar:this.options.noglobstar,
          matchBase:this.options.matchBase,
          nocase:this.options.nocase
        })
      );
    }
  
    this.ignoreMatchers = [];
    if(this.options.ignore) {
      const ignorePatterns = Array.isArray(this.options.ignore) ? this.options.ignore : [this.options.ignore];
      this.ignoreMatchers = ignorePatterns.map( ignore =>
        new Minimatch(ignore, {dot: true})
      );
    }
  
    this.skipMatchers = [];
    if(this.options.skip) {
      const skipPatterns = Array.isArray(this.options.skip) ? this.options.skip : [this.options.skip];
      this.skipMatchers = skipPatterns.map( skip =>
        new Minimatch(skip, {dot: true})
      );
    }

    this.iterator = explore(resolve(cwd || '.'), this.options.follow, this.options.stat, this._shouldSkipDirectory.bind(this));
    this.paused = false;
    this.inactive = false;
    this.aborted = false;
  
    if(cb) {
      const nonNullCb = cb;
      const matches: string[] = [];
      this.on('match', match => matches.push(this.options.absolute ? match.absolute : match.relative));
      this.on('error', err => nonNullCb(err));
      this.on('end', () => nonNullCb(null, matches));
    }

    setTimeout( () => this._next() );
  }

  private _shouldSkipDirectory(relative: string) {
    return this.skipMatchers.some(m => m.match(relative));
  }

  private _fileMatches(relative: string, isDirectory: boolean) {
    const file = relative + (isDirectory ? '/' : '');
    return (this.matchers.length === 0 || this.matchers.some(m => m.match(file)))
      && !this.ignoreMatchers.some(m => m.match(file))
      && (!this.options.nodir || !isDirectory);
  }

  private _next() {
    if(!this.paused && !this.aborted) {
      this.iterator.next()
      .then((obj)=> {
        if(!obj.done) {
          const isDirectory = obj.value.stat.isDirectory();
          if(this._fileMatches(obj.value.relative, isDirectory )) {
            let relative = obj.value.relative;
            let absolute = obj.value.absolute;
            if(this.options.mark && isDirectory) {
              relative += '/';
              absolute += '/';
            }
            if(this.options.stat) {
              this.emit('match', {relative, absolute, stat:obj.value.stat});
            } else {
              this.emit('match', {relative, absolute});
            }
          }
          this._next();
        } else {
          this.emit('end');
        }
      })
      .catch((err: NodeJS.ErrnoException) => {
        this.abort();
        this.emit('error', err);
        if(!err.code && !this.options.silent) {
          console.error(err);
        }
      });
    } else {
      this.inactive = true;
    }
  }

  abort(): void {
    this.aborted = true;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    if(this.inactive) {
      this.inactive = false;
      this._next();
    }
  }
}

interface readdirGlobInterface {
  (pattern?: string, options?: Options | Callback, cb?: Callback): ReaddirGlob;
  ReaddirGlob: typeof ReaddirGlob;
}

export const readdirGlob: readdirGlobInterface = (pattern?: string, options?: Options | Callback, cb?: Callback) =>
  new ReaddirGlob(pattern, options, cb);

readdirGlob.ReaddirGlob = ReaddirGlob;

export default readdirGlob;
