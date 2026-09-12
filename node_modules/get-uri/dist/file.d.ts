import { Readable } from 'stream';
import { Stats, createReadStream } from 'fs';
import { GetUriProtocol } from './index.js';
type ReadStreamOptions = NonNullable<Exclude<Parameters<typeof createReadStream>[1], string>>;
interface FileReadable extends Readable {
    stat?: Stats;
}
export interface FileOptions extends ReadStreamOptions {
    cache?: FileReadable;
}
/**
 * Returns a `fs.ReadStream` instance from a "file:" URI.
 */
export declare const file: GetUriProtocol<FileOptions>;
export {};
//# sourceMappingURL=file.d.ts.map