import createDebug from 'debug';
import { createReadStream, promises as fsPromises } from 'fs';
import NotFoundError from './notfound.js';
import NotModifiedError from './notmodified.js';
import { fileURLToPath } from 'url';
const debug = createDebug('get-uri:file');
/**
 * Returns a `fs.ReadStream` instance from a "file:" URI.
 */
export const file = async ({ href: uri }, opts = {}) => {
    const { cache, flags = 'r', mode = 438, // =0666
     } = opts;
    try {
        // Convert URI → Path
        const filepath = fileURLToPath(uri);
        debug('Normalized pathname: %o', filepath);
        // `open()` first to get a file descriptor and ensure that the file
        // exists.
        const fdHandle = await fsPromises.open(filepath, flags, mode);
        // store the stat object for the cache.
        const stat = await fdHandle.stat();
        // if a `cache` was provided, check if the file has not been modified
        if (cache && cache.stat && stat && isNotModified(cache.stat, stat)) {
            await fdHandle.close();
            throw new NotModifiedError();
        }
        // `fs.ReadStream` takes care of closing the file handle
        // after it's done reading
        const rs = createReadStream(filepath, {
            autoClose: true,
            ...opts,
            fd: fdHandle,
        });
        rs.stat = stat;
        return rs;
    }
    catch (err) {
        if (err.code === 'ENOENT') {
            throw new NotFoundError();
        }
        throw err;
    }
};
// returns `true` if the `mtime` of the 2 stat objects are equal
function isNotModified(prev, curr) {
    return +prev.mtime === +curr.mtime;
}
//# sourceMappingURL=file.js.map