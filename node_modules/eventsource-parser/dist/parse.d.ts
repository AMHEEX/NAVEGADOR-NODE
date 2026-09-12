import type { EventSourceParser, ParserConfig } from './types.ts';
/**
 * Creates a new EventSource parser.
 *
 * @param config - Parser configuration. Accepts callbacks (see {@link ParserCallbacks})
 *   and options like `maxBufferSize` (see {@link ParserConfig}).
 *
 * @returns A new EventSource parser, with `feed` and `reset` methods.
 * @public
 */
export declare function createParser(config: ParserConfig): EventSourceParser;
//# sourceMappingURL=parse.d.ts.map