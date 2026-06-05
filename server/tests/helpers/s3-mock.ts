import { vi } from 'vitest';

/**
 * In-memory mock for @aws-sdk/client-s3.
 *
 * Usage (must be called at the top level of the test file, BEFORE importing
 * any module that pulls in @aws-sdk/client-s3 — Vitest hoists vi.mock):
 *
 *   import { installS3Mock, s3Calls } from '../../helpers/s3-mock.js';
 *   installS3Mock();
 *
 * Then in tests:
 *
 *   expect(s3Calls.puts).toHaveLength(1);
 *   expect(s3Calls.puts[0].Key).toMatch(/prize-images\//);
 *
 * The mock records every PutObjectCommand / DeleteObjectCommand the code
 * under test issues, so tests never touch the real Railway Bucket.
 */

export interface RecordedPut {
  Bucket: string;
  Key: string;
  ContentType?: string;
  Body: unknown;
}

export interface RecordedDelete {
  Bucket: string;
  Key: string;
}

export const s3Calls: {
  puts: RecordedPut[];
  deletes: RecordedDelete[];
} = { puts: [], deletes: [] };

export function resetS3Calls(): void {
  s3Calls.puts.length = 0;
  s3Calls.deletes.length = 0;
}

export function installS3Mock(): void {
  vi.mock('@aws-sdk/client-s3', () => {
    class PutObjectCommand {
      input: RecordedPut;
      constructor(input: RecordedPut) {
        this.input = input;
      }
    }
    class DeleteObjectCommand {
      input: RecordedDelete;
      constructor(input: RecordedDelete) {
        this.input = input;
      }
    }
    class S3Client {
      // Accept any config; we don't validate it in tests.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(_config?: any) {}
      async send(cmd: PutObjectCommand | DeleteObjectCommand): Promise<unknown> {
        if (cmd instanceof PutObjectCommand) {
          s3Calls.puts.push(cmd.input);
          return { $metadata: { httpStatusCode: 200 } };
        }
        if (cmd instanceof DeleteObjectCommand) {
          s3Calls.deletes.push(cmd.input);
          return { $metadata: { httpStatusCode: 204 } };
        }
        return { $metadata: { httpStatusCode: 200 } };
      }
    }
    return { S3Client, PutObjectCommand, DeleteObjectCommand };
  });
}
