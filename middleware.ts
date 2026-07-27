import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // /@matador → /u/matador (URL di browser tetap /@matador)
  if (pathname.startsWith('/@')) {
    const username = decodeURIComponent(pathname.slice(2).split('/')[0])
    if (username) {
      const url = request.nextUrl.clone()
      url.pathname = `/u/${username}`
      return NextResponse.rewrite(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}