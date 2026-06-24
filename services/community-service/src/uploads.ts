import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createLogger } from '@nightfuel/config';
import { randomBytes } from 'crypto';
import { createReadStream } from 'fs';
import { mkdir, writeFile, stat } from 'fs/promises';
import * as path from 'path';

const logger = createLogger('community.uploads');

// ── Image upload (BUG #3) ──────────────────────────────────────────────────────
// A post's image was being stored as the author's local `file://` ImagePicker URI,
// which other devices correctly reject (only https is trusted on-device), leaving
// the image blank for everyone but the author. The fix is a real upload: the
// client POSTs the picked file here as multipart/form-data, we persist the bytes
// under a local uploads directory served statically over the SAME gateway prefix
// (/v1/community/uploads/<file>), and return the absolute https URL the post is
// then created with. No external storage / cloud creds required.
//
// OWNER: for multi-instance scale move this to S3/CDN (the returned URL is the only
// contract the rest of the system depends on). For a single API host a local dir
// is sufficient — just ensure it is writable and PERSISTED across deploys (mount a
// volume) so already-posted images survive a container rebuild.

/** Hard cap on an uploaded image (bytes). Mirrors a sane mobile photo at q≈0.7. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB

/** Allowed image content-types → file extension. Anything else is rejected. */
const MIME_EXT: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/heif': 'heif',
};

/**
 * Resolve the on-disk uploads directory. Configurable via UPLOAD_DIR; defaults to
 * `<cwd>/uploads` which, with the runner WORKDIR (/app/services/community-service),
 * is a writable path inside the container.
 */
export function resolveUploadDir(): string {
    const raw = process.env.UPLOAD_DIR && process.env.UPLOAD_DIR.trim().length > 0
        ? process.env.UPLOAD_DIR.trim()
        : path.join(process.cwd(), 'uploads');
    return path.resolve(raw);
}

/**
 * Public base URL the stored image URL is built from. Prefers PUBLIC_BASE_URL,
 * falls back to API_BASE_URL, then to the production gateway. MUST be https so the
 * on-device trust gate (clients/mobile/src/lib/imageUrl.ts) accepts it on every
 * device. The path segment `/v1/community/uploads` rides the existing nginx
 * `location /v1/community` proxy block, so no gateway rule needs to change.
 *
 * OWNER: set PUBLIC_BASE_URL to your https API origin in any non-default
 * environment (staging/self-host). The default targets the live prod gateway.
 */
export function resolvePublicBaseUrl(): string {
    const raw =
        process.env.PUBLIC_BASE_URL?.trim() ||
        process.env.API_BASE_URL?.trim() ||
        'https://api.zeitra.app';
    return raw.replace(/\/+$/, ''); // drop any trailing slash(es)
}

/** Build the absolute, https public URL for a stored upload filename. */
export function publicUrlForFile(fileName: string): string {
    return `${resolvePublicBaseUrl()}/v1/community/uploads/${fileName}`;
}

interface ParsedFilePart {
    /** Raw file bytes. */
    data: Buffer;
    /** Declared content-type of the part (e.g. image/jpeg), lower-cased. */
    contentType: string;
}

/**
 * Minimal multipart/form-data parser — extracts the FIRST file part (a part whose
 * Content-Disposition carries a `filename`). Intentionally tiny and dependency-free
 * (no busboy / @fastify/multipart, which aren't installed): we control the client,
 * which sends exactly one `image` file part. Returns null if no file part is found.
 *
 * It is byte-safe: the part boundary search and the header/body split are done on
 * the Buffer (latin1 only for locating ASCII delimiters), so binary image bytes are
 * never corrupted by a utf-8 round-trip.
 */
export function parseFirstFilePart(body: Buffer, contentTypeHeader: string): ParsedFilePart | null {
    const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentTypeHeader);
    const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
    if (!boundary) return null;

    const delimiter = Buffer.from(`--${boundary}`, 'latin1');
    const CRLF = Buffer.from('\r\n', 'latin1');
    const HEADER_SEP = Buffer.from('\r\n\r\n', 'latin1');

    let cursor = 0;
    while (cursor < body.length) {
        const start = body.indexOf(delimiter, cursor);
        if (start === -1) break;
        let partStart = start + delimiter.length;
        // Closing delimiter ("--boundary--") → end of payload.
        if (body.slice(partStart, partStart + 2).toString('latin1') === '--') break;
        // Skip the CRLF after the boundary line.
        if (body.slice(partStart, partStart + 2).equals(CRLF)) partStart += 2;

        const headerEnd = body.indexOf(HEADER_SEP, partStart);
        if (headerEnd === -1) break;
        const rawHeaders = body.slice(partStart, headerEnd).toString('latin1');
        const bodyStart = headerEnd + HEADER_SEP.length;

        // Next boundary marks this part's end; the body is bytes before the
        // trailing CRLF that precedes it.
        const nextBoundary = body.indexOf(delimiter, bodyStart);
        const bodyEnd = nextBoundary === -1 ? body.length : nextBoundary;
        let partBodyEnd = bodyEnd;
        if (body.slice(bodyEnd - 2, bodyEnd).equals(CRLF)) partBodyEnd = bodyEnd - 2;

        const isFile = /content-disposition:[^\n]*filename=/i.test(rawHeaders);
        if (isFile) {
            const ctMatch = /content-type:\s*([^\r\n;]+)/i.exec(rawHeaders);
            const contentType = (ctMatch?.[1] ?? 'application/octet-stream').trim().toLowerCase();
            return { data: body.slice(bodyStart, partBodyEnd), contentType };
        }

        cursor = nextBoundary === -1 ? body.length : nextBoundary;
    }

    return null;
}

/**
 * Register a raw body collector for multipart/form-data so the upload handler can
 * read `request.body` as a Buffer. Bounded by MAX_UPLOAD_BYTES — an oversize stream
 * is aborted before it can exhaust memory. Idempotent-safe to call once at boot.
 */
export function registerMultipartCollector(fastify: FastifyInstance): void {
    fastify.addContentTypeParser(
        'multipart/form-data',
        { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES },
        // body is already a Buffer (parseAs: 'buffer'); the explicit Buffer type
        // pins the correct overload. Fastify enforces bodyLimit before we see it.
        (_req: FastifyRequest, body: Buffer, done: (err: Error | null, body?: unknown) => void) => {
            done(null, body);
        },
    );
}

/**
 * Handle POST /v1/community/upload — persist the first image file part and return
 * its absolute https URL. The caller (routes.ts) supplies the authenticated guard.
 */
export async function handleUpload(request: FastifyRequest, reply: FastifyReply) {
    const contentType = request.headers['content-type'] ?? '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
        return reply.code(400).send({ error: 'Expected multipart/form-data' });
    }

    const body = request.body as Buffer | undefined;
    if (!Buffer.isBuffer(body) || body.length === 0) {
        return reply.code(400).send({ error: 'Empty upload' });
    }

    const part = parseFirstFilePart(body, contentType);
    if (!part || part.data.length === 0) {
        return reply.code(400).send({ error: 'No file part found' });
    }
    if (part.data.length > MAX_UPLOAD_BYTES) {
        return reply.code(413).send({ error: 'File too large' });
    }

    const ext = MIME_EXT[part.contentType];
    if (!ext) {
        return reply.code(415).send({ error: 'Unsupported image type' });
    }

    const fileName = `${Date.now()}-${randomBytes(12).toString('hex')}.${ext}`;
    const dir = resolveUploadDir();
    try {
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, fileName), part.data);
    } catch (err) {
        logger.error({ err }, 'Failed to persist upload');
        return reply.code(500).send({ error: 'Failed to store image' });
    }

    const url = publicUrlForFile(fileName);
    logger.info({ fileName, bytes: part.data.length }, 'Image uploaded');
    return reply.code(201).send({ url });
}

/** Content-type to serve a stored upload with, by file extension. */
const EXT_MIME: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    heic: 'image/heic',
    heif: 'image/heif',
};

/**
 * Handle GET /v1/community/uploads/:file — stream a stored image from the uploads
 * directory. Hardened against path traversal: the `:file` param must be a plain
 * basename (no separators, no `..`), and the resolved path is asserted to live
 * inside the uploads dir before any read.
 */
export async function handleServeUpload(request: FastifyRequest, reply: FastifyReply) {
    const { file } = request.params as { file: string };

    // Reject anything that isn't a single safe filename segment.
    if (!file || file !== path.basename(file) || file.includes('..') || /[\\/]/.test(file)) {
        return reply.code(400).send({ error: 'Invalid file name' });
    }

    const dir = resolveUploadDir();
    const fullPath = path.resolve(dir, file);
    // Defense in depth: the resolved path MUST remain within the uploads dir.
    if (fullPath !== path.join(dir, file) || !fullPath.startsWith(dir + path.sep)) {
        return reply.code(400).send({ error: 'Invalid file name' });
    }

    try {
        const info = await stat(fullPath);
        if (!info.isFile()) return reply.code(404).send({ error: 'Not found' });

        const ext = path.extname(file).slice(1).toLowerCase();
        const mime = EXT_MIME[ext] ?? 'application/octet-stream';
        reply
            .header('Content-Type', mime)
            .header('Content-Length', info.size)
            // Uploaded images are immutable (random filenames) → cache aggressively.
            .header('Cache-Control', 'public, max-age=31536000, immutable');
        return reply.send(createReadStream(fullPath));
    } catch (err: any) {
        if (err?.code === 'ENOENT') return reply.code(404).send({ error: 'Not found' });
        logger.error({ err, file }, 'Failed to serve upload');
        return reply.code(500).send({ error: 'Failed to serve image' });
    }
}
