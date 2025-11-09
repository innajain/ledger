import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyPasswordEdge  } from '@/hashing-edge';

export function middleware(request: NextRequest) {
  // Get Basic Auth header
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Secure Area"',
      },
    });
  }

  // Decode Basic Auth credentials
  const base64Credentials = authHeader.substring(6);
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
  const [username, password] = credentials.split(':');

  const storedHash = process.env.PASSWORD_HASH;

  if (!storedHash) {
    console.error('PASSWORD_HASH not set in environment variables');
    return new NextResponse('Server configuration error', {
      status: 500,
    });
  }

  // Verify password (username is ignored, only password matters)
  const isValid = verifyPasswordEdge(password, storedHash);

  if (!isValid) {
    return new NextResponse('Invalid credentials', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Secure Area"',
      },
    });
  }

  // Allow request to proceed
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};