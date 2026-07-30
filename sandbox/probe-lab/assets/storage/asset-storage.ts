export type AssetStorageVisibility =
  | "public"
  | "private";

export type AssetStorageUploadInput = {
  local_path: string;
  object_key: string;
  content_type: string;
  visibility: AssetStorageVisibility;
  cache_control?: string;
  metadata?: Record<string, string>;
};

export type AssetStorageUploadBytesInput = {
  body: Uint8Array | string;
  object_key: string;
  content_type: string;
  visibility: AssetStorageVisibility;
  cache_control?: string;
  metadata?: Record<string, string>;
};

export type AssetStorageObject = {
  provider: "r2";
  bucket: string;
  object_key: string;
  public_url: string | null;
  etag: string | null;
  size_bytes: number;
  content_type: string;
};

export type AssetStorageReadResult = {
  provider: "r2";
  bucket: string;
  object_key: string;
  body: Uint8Array;
  etag: string | null;
  size_bytes: number;
  content_type: string | null;
};

export type AssetStorageProvider = {
  readonly provider: "r2";
  readonly bucket: string;
  readonly visibility: AssetStorageVisibility;

  upload(
    input: AssetStorageUploadInput,
  ): Promise<AssetStorageObject>;

  uploadBytes(
    input: AssetStorageUploadBytesInput,
  ): Promise<AssetStorageObject>;

  read(
    objectKey: string,
  ): Promise<AssetStorageReadResult | null>;

  exists(objectKey: string): Promise<boolean>;

  delete(objectKey: string): Promise<void>;
};
