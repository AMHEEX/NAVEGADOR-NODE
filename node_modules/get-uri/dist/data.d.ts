import { Readable } from 'stream';
import { GetUriProtocol } from './index.js';
declare class DataReadable extends Readable {
    hash?: string;
    constructor(hash: string, buf: Buffer);
}
export interface DataOptions {
    cache?: DataReadable;
}
/**
 * Returns a Readable stream from a "data:" URI.
 */
export declare const data: GetUriProtocol<DataOptions>;
export {};
//# sourceMappingURL=data.d.ts.map