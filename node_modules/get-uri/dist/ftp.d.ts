import { AccessOptions } from 'basic-ftp';
import { Readable } from 'stream';
import { GetUriProtocol } from './index.js';
export interface FTPReadable extends Readable {
    lastModified?: Date;
}
export interface FTPOptions extends AccessOptions {
    cache?: FTPReadable;
}
/**
 * Returns a Readable stream from an "ftp:" URI.
 */
export declare const ftp: GetUriProtocol<FTPOptions>;
//# sourceMappingURL=ftp.d.ts.map