import "server-only";

/**
 * Google Drive adapter interface (not yet enabled). Implementations will use a
 * Drive-scoped OAuth token to list folders and stream files into the normal
 * upload pipeline (services/files.putFileFromServer) so imported files get
 * versions, metadata extraction and search indexing for free.
 */
export interface DriveAdapter {
  listFolder(folderId: string): Promise<{ id: string; name: string; mimeType: string; size: number; modifiedTime: string }[]>;
  download(fileId: string): Promise<Buffer>;
}

export function driveAdapter(): DriveAdapter | null {
  return null;
}
