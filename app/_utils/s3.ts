import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export function s3_client() {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT!,
    region: process.env.S3_REGION ?? 'auto',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true,
  })
}

const BUCKET = () => process.env.S3_BUCKET!

export function get_signed_put_url(pathname: string, content_type: string, expires_in = 300) {
  return getSignedUrl(s3_client(), new PutObjectCommand({ Bucket: BUCKET(), Key: pathname, ContentType: content_type }), { expiresIn: expires_in })
}

export function get_signed_get_url(pathname: string, expires_in = 3600) {
  return getSignedUrl(s3_client(), new GetObjectCommand({ Bucket: BUCKET(), Key: pathname }), { expiresIn: expires_in })
}

export async function delete_object(pathname: string) {
  await s3_client().send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: pathname }))
}
