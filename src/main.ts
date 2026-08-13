import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyMultipart from '@fastify/multipart';
import { AppModule } from './app.module';
import { join } from 'path';
import { createReadStream, existsSync } from 'fs';

// `bodyLimit` gates only BUFFERED bodies — JSON, urlencoded, plain text (for example a
// client base64-encoding a file inside a JSON payload). It does NOT cap multipart/form-data
// uploads: @fastify/multipart registers its own streaming parser, which never passes through
// the adapter's buffer-based check. Set explicitly rather than left at Fastify's silent 1 MiB
// default, and kept modest on purpose — a buffered body is held in memory and this container
// is memory-capped, so one oversized request should not be able to exhaust it.
// DO NOT read this as an upload/file-size ceiling — that is UPLOAD_FILE_SIZE_LIMIT_BYTES below.
const JSON_BODY_LIMIT_BYTES = 10 * 1024 * 1024; // 10 MB

// The actual ceiling for multipart/form-data file uploads (images, video, other files).
// @fastify/multipart streams each part and enforces `limits.fileSize` during that stream —
// this, not `bodyLimit` above, is what a client's upload is capped against.
const UPLOAD_FILE_SIZE_LIMIT_BYTES = 150 * 1024 * 1024; // 150 MB

// Cap parts per request too: `fileSize` bounds each file, not how many arrive at once.
const UPLOAD_MAX_FILES_PER_REQUEST = 10;

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: JSON_BODY_LIMIT_BYTES }),
  );

  const fastify = app.getHttpAdapter().getInstance();

  // multipart/form-data uploads (images, video, other files).
  await app.register(fastifyMultipart, {
    limits: { fileSize: UPLOAD_FILE_SIZE_LIMIT_BYTES, files: UPLOAD_MAX_FILES_PER_REQUEST },
  });

  // SPA fallback: rewrite 404s to index.html for non-API non-asset paths.
  // Use onSend hook (fires after status is decided, before body is flushed).
  const indexPath = join(__dirname, 'public', 'index.html');
  fastify.addHook('onSend', async (request, reply, payload) => {
    if (
      reply.statusCode === 404 &&
      !request.url.startsWith('/api/') &&
      !request.url.startsWith('/assets/') &&
      existsSync(indexPath)
    ) {
      reply.code(200).type('text/html');
      return createReadStream(indexPath);
    }
    return payload;
  });

  await app.listen(process.env.PORT || 3000, '0.0.0.0');
}
bootstrap();
