import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getToken } from 'next-auth/jwt';

const PUBLIC_PATHS = ['/', '/login', '/signup'];
// 로그인 전에 호출해야 하는 공개 API(회원가입)
const PUBLIC_API_PATHS = ['/api/signup'];
// 이미 로그인한 사용자가 오면 홈/상태 페이지로 돌려보내는 인증 화면
const AUTH_ENTRY_PATHS = ['/login', '/signup'];
const ADMIN_PATH_PREFIXES = ['/signup-management', '/admin', '/api/admin', '/students/import', '/api/students/import'];
const GUEST_PATH_PREFIX = '/guest';
const PENDING_PATH = '/pending';
const REJECTED_PATH = '/rejected';

/**
 * NEXTAUTH_URL에서 캐노니컬 Origin을 파싱한다.
 */
function getCanonicalOrigin(): URL | null {
  const nextAuthUrl = process.env.NEXTAUTH_URL;

  if (!nextAuthUrl) {
    return null;
  }

  try {
    return new URL(nextAuthUrl);
  } catch {
    return null;
  }
}

/**
 * 요청 경로가 항상 공개 접근 가능한 경로인지 확인한다.
 */
function isAlwaysPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname);
}

/**
 * 게스트 모드 경로인지 확인한다.
 * 데모 데이터만 노출하므로 로그인 여부와 승인 상태에 관계없이 통과시킨다.
 */
function isGuestPath(pathname: string): boolean {
  return pathname === GUEST_PATH_PREFIX || pathname.startsWith(`${GUEST_PATH_PREFIX}/`);
}

/**
 * 인증 검사를 생략해야 하는 내부 경로인지 확인한다.
 */
function isBypassPath(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    PUBLIC_API_PATHS.includes(pathname) ||
    pathname === '/favicon.ico'
  );
}

/**
 * 관리자만 들어갈 수 있는 경로인지 확인한다(가입 관리, 조직 관리, 학년 진급, CSV 일괄 등록과 그 API).
 */
function isAdminOnlyPath(pathname: string): boolean {
  return ADMIN_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * 원래 요청 경로를 보존하기 위해 callback_url이 포함된 로그인 URL을 생성한다.
 */
function buildLoginUrl(req: NextRequest): URL {
  const loginUrl = new URL('/login', req.url);
  const requestedPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;

  loginUrl.searchParams.set('callback_url', requestedPath);

  return loginUrl;
}

/**
 * 승인 상태에 따라 이동해야 하는 상태 페이지 경로를 반환한다.
 */
function getApprovalStatusPath(approvalStatus: unknown): string {
  if (approvalStatus === 'REJECTED') {
    return REJECTED_PATH;
  }

  return PENDING_PATH;
}

/**
 * 매칭된 모든 요청에 인증 및 승인 상태 가드를 적용한다.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const canonicalOrigin = getCanonicalOrigin();

  if (canonicalOrigin) {
    const requestHost = req.nextUrl.host;
    const requestProtocol = req.nextUrl.protocol;
    const canonicalHost = canonicalOrigin.host;
    const canonicalProtocol = canonicalOrigin.protocol;

    if (requestHost !== canonicalHost || requestProtocol !== canonicalProtocol) {
      const redirectUrl = new URL(req.nextUrl.pathname + req.nextUrl.search, canonicalOrigin);
      return NextResponse.redirect(redirectUrl, 307);
    }
  }

  if (pathname.startsWith('/operations')) {
    return NextResponse.redirect(new URL('/signup-management', req.url));
  }

  if (isBypassPath(pathname) || isGuestPath(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
  });

  if (!token && !isAlwaysPublicPath(pathname)) {
    return NextResponse.redirect(buildLoginUrl(req));
  }

  if (!token) {
    return NextResponse.next();
  }

  const approvalStatusPath = getApprovalStatusPath(token.approvalStatus);
  const isStatusPage = pathname === PENDING_PATH || pathname === REJECTED_PATH;

  if (token.approvalStatus !== 'APPROVED' && pathname !== approvalStatusPath) {
    return NextResponse.redirect(new URL(approvalStatusPath, req.url));
  }

  if (token.approvalStatus === 'APPROVED' && isStatusPage) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  if (isAdminOnlyPath(pathname) && token.role !== 'ADMIN') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ message: 'forbidden' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/', req.url));
  }

  if (AUTH_ENTRY_PATHS.includes(pathname)) {
    if (token.approvalStatus !== 'APPROVED') {
      return NextResponse.redirect(new URL(approvalStatusPath, req.url));
    }

    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)'],
};
