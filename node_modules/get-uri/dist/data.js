import createDebug from 'debug';
import { Readable } from 'stream';
import { createHash } from 'crypto';
import { dataUriToBuffer } from 'data-uri-to-buffer';
import NotModifiedError from './notmodified.js';
const debug = createDebug('get-uri:data');
class DataReadable extends Readable {
    constructor(hash, buf) {
        super();
        this.push(buf);
        this.push(null);
        this.hash = hash;
    }
}
/**
 * Returns a Readable stream from a "data:" URI.
 */
export const data = async ({ href: uri }, { cache } = {}) => {
    // need to create a SHA1 hash of the URI string, for cacheability checks
    // in future `getUri()` calls with the same data URI passed in.
    const shasum = createHash('sha1');
    shasum.update(uri);
    const hash = shasum.digest('hex');
    debug('generated SHA1 hash for "data:" URI: %o', hash);
    // check if the cache is the same "data:" URI that was previously passed in.
    if (cache?.hash === hash) {
        debug('got matching cache SHA1 hash: %o', hash);
        throw new NotModifiedError();
    }
    else {
        debug('creating Readable stream from "data:" URI buffer');
        const { buffer } = dataUriToBuffer(uri);
        return new DataReadable(hash, Buffer.from(buffer));
    }
};
//# sourceMappingURL=data.js.map