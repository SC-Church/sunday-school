import { NextRequest } from 'next/server';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getTokenMock = vi.hoisted(() => vi.fn());

vi.mock('next-auth/jwt', () => ({
  getToken: getTokenMock,
}));

const { proxy } = await import('@/proxy');

const SITE_ORIGIN = 'https://sunday.example.com';

/**
 * 테스트용 요청 객체를 만든다.
 */
function request(pathname: string): NextRequest {
  return new NextRequest(`${SITE_ORIGIN}${pathname}`);
}

/**
 * 응답의 리다이렉트 대상 경로(쿼리 포함)를 반환한다.
 */
function redirectTarget(response: Response): string | null {
  const location = response.headers.get('location');

  return location ? location.replace(SITE_ORIGIN, '') : null;
}

beforeEach(() => {
  getTokenMock.mockReset();
  vi.stubEnv('NEXTAUTH_URL', SITE_ORIGIN);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('proxy - 미로그인', () => {
  beforeEach(() => {
    getTokenMock.mockResolvedValue(null);
  });

  it('보호된 경로는 원래 경로를 callback_url에 담아 로그인으로 보낸다', async () => {
    const response = await proxy(request('/students'));

    expect(response.status).toBe(307);
    expect(redirectTarget(response)).toBe('/login?callback_url=%2Fstudents');
  });

  it('쿼리스트링도 callback_url에 보존한다', async () => {
    const response = await proxy(request('/attendance?attendance_tab=this_week'));

    expect(redirectTarget(response)).toBe('/login?callback_url=%2Fattendance%3Fattendance_tab%3Dthis_week');
  });

  it('공개 경로(/, /login, /signup)는 통과시킨다', async () => {
    expect(redirectTarget(await proxy(request('/')))).toBeNull();
    expect(redirectTarget(await proxy(request('/login')))).toBeNull();
    expect(redirectTarget(await proxy(request('/signup')))).toBeNull();
  });

  it('회원가입 API는 로그인 없이 호출할 수 있다', async () => {
    expect(redirectTarget(await proxy(request('/api/signup')))).toBeNull();
    expect(getTokenMock).not.toHaveBeenCalled();
  });

  it('회원가입 API 외의 API는 로그인 없이 통과시키지 않는다', async () => {
    expect(redirectTarget(await proxy(request('/api/signup-management')))).toBe(
      '/login?callback_url=%2Fapi%2Fsignup-management'
    );
    expect(redirectTarget(await proxy(request('/api/students')))).toBe('/login?callback_url=%2Fapi%2Fstudents');
  });

  it('인증 API 경로는 검사하지 않는다', async () => {
    expect(redirectTarget(await proxy(request('/api/auth/callback/credentials')))).toBeNull();
    expect(getTokenMock).not.toHaveBeenCalled();
  });

  it('게스트 경로는 로그인 없이 통과시킨다', async () => {
    expect(redirectTarget(await proxy(request('/guest')))).toBeNull();
    expect(redirectTarget(await proxy(request('/guest/students')))).toBeNull();
  });

  it('게스트 접두사만 같은 경로는 통과시키지 않는다', async () => {
    expect(redirectTarget(await proxy(request('/guestbook')))).toBe('/login?callback_url=%2Fguestbook');
  });
});

describe('proxy - 게스트 경로', () => {
  it('승인 대기 교사도 게스트 경로는 그대로 볼 수 있다', async () => {
    getTokenMock.mockResolvedValue({ approvalStatus: 'PENDING', role: 'TEACHER' });

    expect(redirectTarget(await proxy(request('/guest/dashboard')))).toBeNull();
  });

  it('승인된 교사도 게스트 경로는 그대로 볼 수 있다', async () => {
    getTokenMock.mockResolvedValue({ approvalStatus: 'APPROVED', role: 'TEACHER' });

    expect(redirectTarget(await proxy(request('/guest')))).toBeNull();
  });

  it('게스트 경로는 실데이터 경로를 열어주지 않는다', async () => {
    getTokenMock.mockResolvedValue(null);

    expect(redirectTarget(await proxy(request('/students')))).toBe('/login?callback_url=%2Fstudents');
    expect(redirectTarget(await proxy(request('/signup-management')))).toBe('/login?callback_url=%2Fsignup-management');
  });
});

describe('proxy - 승인 상태 분기', () => {
  it('승인 대기 교사는 /pending으로 보낸다', async () => {
    getTokenMock.mockResolvedValue({ approvalStatus: 'PENDING', role: 'TEACHER' });

    expect(redirectTarget(await proxy(request('/students')))).toBe('/pending');
  });

  it('거절된 교사는 /rejected로 보낸다', async () => {
    getTokenMock.mockResolvedValue({ approvalStatus: 'REJECTED', role: 'TEACHER' });

    expect(redirectTarget(await proxy(request('/students')))).toBe('/rejected');
  });

  it('승인 대기 교사가 /rejected에 접근하면 /pending으로 되돌린다', async () => {
    getTokenMock.mockResolvedValue({ approvalStatus: 'PENDING', role: 'TEACHER' });

    expect(redirectTarget(await proxy(request('/rejected')))).toBe('/pending');
  });

  it('승인 대기 교사는 자신의 상태 페이지에는 머무를 수 있다', async () => {
    getTokenMock.mockResolvedValue({ approvalStatus: 'PENDING', role: 'TEACHER' });

    expect(redirectTarget(await proxy(request('/pending')))).toBeNull();
  });

  it('승인된 교사가 상태 페이지에 접근하면 홈으로 보낸다', async () => {
    getTokenMock.mockResolvedValue({ approvalStatus: 'APPROVED', role: 'TEACHER' });

    expect(redirectTarget(await proxy(request('/pending')))).toBe('/');
  });

  it('승인된 교사가 로그인/회원가입 페이지에 접근하면 홈으로 보낸다', async () => {
    getTokenMock.mockResolvedValue({ approvalStatus: 'APPROVED', role: 'TEACHER' });

    expect(redirectTarget(await proxy(request('/login')))).toBe('/');
    expect(redirectTarget(await proxy(request('/signup')))).toBe('/');
  });

  it('승인 대기 교사가 회원가입 페이지에 접근하면 /pending으로 보낸다', async () => {
    getTokenMock.mockResolvedValue({ approvalStatus: 'PENDING', role: 'TEACHER' });

    expect(redirectTarget(await proxy(request('/signup')))).toBe('/pending');
  });

  it('삭제되어 승인 정보가 지워진 세션은 보호된 경로에 들어갈 수 없다', async () => {
    getTokenMock.mockResolvedValue({ email: 'deleted@x.com' });

    expect(redirectTarget(await proxy(request('/students')))).toBe('/pending');
  });
});

describe('proxy - 관리자 전용 경로', () => {
  it('일반 교사의 /signup-management 접근을 차단한다', async () => {
    getTokenMock.mockResolvedValue({ approvalStatus: 'APPROVED', role: 'TEACHER' });

    expect(redirectTarget(await proxy(request('/signup-management')))).toBe('/');
  });

  it('일반 교사의 조직 관리·학년 진급·일괄 등록 화면 접근을 차단한다', async () => {
    getTokenMock.mockResolvedValue({ approvalStatus: 'APPROVED', role: 'TEACHER' });

    expect(redirectTarget(await proxy(request('/admin/organization')))).toBe('/');
    expect(redirectTarget(await proxy(request('/admin/promotion')))).toBe('/');
    expect(redirectTarget(await proxy(request('/students/import')))).toBe('/');
    // 접두사만 같은 경로(/administrator, /students/importer)는 관리자 전용이 아니다
    expect(redirectTarget(await proxy(request('/students/importer')))).toBeNull();
  });

  it('일반 교사의 관리자 API 호출은 403 JSON으로 거절한다', async () => {
    getTokenMock.mockResolvedValue({ approvalStatus: 'APPROVED', role: 'TEACHER' });

    const response = await proxy(request('/api/admin/classes'));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: 'forbidden' });

    expect((await proxy(request('/api/students/import'))).status).toBe(403);
  });

  it('관리자는 조직 관리와 관리자 API에 접근할 수 있다', async () => {
    getTokenMock.mockResolvedValue({ approvalStatus: 'APPROVED', role: 'ADMIN' });

    expect(redirectTarget(await proxy(request('/admin/organization')))).toBeNull();
    expect((await proxy(request('/api/admin/classes'))).status).toBe(200);
  });

  it('관리자는 /signup-management에 접근할 수 있다', async () => {
    getTokenMock.mockResolvedValue({ approvalStatus: 'APPROVED', role: 'ADMIN' });

    expect(redirectTarget(await proxy(request('/signup-management')))).toBeNull();
  });

  it('승인된 일반 교사는 일반 경로를 통과한다', async () => {
    getTokenMock.mockResolvedValue({ approvalStatus: 'APPROVED', role: 'TEACHER' });

    expect(redirectTarget(await proxy(request('/students')))).toBeNull();
  });
});

describe('proxy - 캐노니컬 도메인', () => {
  it('다른 도메인으로 들어오면 NEXTAUTH_URL 도메인으로 되돌린다', async () => {
    getTokenMock.mockResolvedValue({ approvalStatus: 'APPROVED', role: 'ADMIN' });

    const response = await proxy(new NextRequest('https://other.example.com/students?grade_tab=1학년'));

    expect(response.headers.get('location')).toBe(`${SITE_ORIGIN}/students?grade_tab=1%ED%95%99%EB%85%84`);
  });
});
