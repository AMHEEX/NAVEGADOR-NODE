import { createParser } from './parse.js';
/**
 * A TransformStream that ingests a stream of strings and produces a stream of `EventSourceMessage`.
 *
 * @example Basic usage
 * ```
 * const eventStream =
 *   response.body
 *     .pipeThrough(new TextDecoderStream())
 *     .pipeThrough(new EventSourceParserStream())
 * ```
 *
 * @example Terminate stream on parsing errors
 * ```
 * const eventStream =
 *  response.body
 *   .pipeThrough(new TextDecoderStream())
 *   .pipeThrough(new EventSourceParserStream({onError: 'terminate'}))
 * ```
 *
 * @public
 */
export class EventSourceParserStream extends TransformStream {
    constructor({ onError, onRetry, onComment, onId, maxBufferSize } = {}) {
        let parser;
        super({
            start(controller) {
                parser = createParser({
                    onEvent: (event) => {
                        controller.enqueue(event);
                    },
                    onError(error) {
                        if (typeof onError === 'function') {
                            onError(error);
                        }
                        // `max-buffer-size-exceeded` is fatal — the parser is unusable until
                        // `reset()`, which the stream wrapper has no way to call. Always
                        // terminate the stream in that case so consumers see the meaningful
                        // `ParseError` instead of an opaque "cannot feed terminated parser"
                        // throw from the next chunk.
                        if (onError === 'terminate' || error.type === 'max-buffer-size-exceeded') {
                            controller.error(error);
                        }
                        // Ignore by default
                    },
                    onRetry,
                    onComment,
                    onId,
                    maxBufferSize,
                });
            },
            transform(chunk) {
                parser.feed(chunk);
            },
        });
    }
}
export { ParseError } from './errors.js';
//# sourceMappingURL=stream.js.map