import { File, UploadType } from 'expo-file-system';

import type { FileUploader } from '@/import/transport';

/**
 * Uploads the raw file bytes from disk: the request body is the file itself, no multipart and no
 * reading into JS memory. The Idempotency-Key and X-File-Name headers come from the transport.
 */
export const expoFileUploader: FileUploader = async ({ url, uri, headers }) => {
  const file = new File(uri);
  if (!file.exists) throw new Error('local copy is missing');
  const result = await file.upload(url, {
    httpMethod: 'POST',
    uploadType: UploadType.BINARY_CONTENT,
    headers,
    // The iOS background session does not restore the promise after a JS restart; the POST outcome
    // is resolved via GET by-key anyway, so a regular foreground session is more honest.
    sessionType: 'foreground',
  });
  return { status: result.status, body: result.body };
};
