import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

import { LOGIN_LOCKED_ERROR, loginThrottle } from '@/lib/login-throttle';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '@/lib/password';
import { normalizeEmail } from '@/lib/validation/auth';
import { findTeacherByEmail, findTeacherByEmailFresh } from '@/server/db/repository';

const TEACHER_SESSION_SYNC_INTERVAL_SECONDS = 60 * 5;
const DEFAULT_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * 이메일/비밀번호로 교사를 인증한다. 성공하면 세션에 담을 사용자 정보를, 실패하면 null을 반환한다.
 * 승인 대기/거절 계정도 로그인은 되며, 이후 proxy가 상태 페이지로 보낸다.
 */
async function authorizeTeacher(credentials: Record<string, string> | undefined) {
  const email = normalizeEmail(credentials?.email);
  const password = typeof credentials?.password === 'string' ? credentials.password : '';

  if (!email || !password) {
    return null;
  }

  if (loginThrottle.isLocked(email)) {
    throw new Error(LOGIN_LOCKED_ERROR);
  }

  const teacher = await findTeacherByEmailFresh(email);
  // 계정이 없거나 비밀번호가 없는 계정도 같은 시간이 걸리도록 가짜 해시로 한 번 검증한다.
  const isPasswordValid = await verifyPassword(password, teacher?.passwordHash ?? DUMMY_PASSWORD_HASH);

  if (!teacher?.passwordHash || !isPasswordValid) {
    loginThrottle.registerFailure(email);
    return null;
  }

  loginThrottle.reset(email);
  return { id: teacher.id, email: teacher.email, name: teacher.name };
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    maxAge: DEFAULT_TOKEN_MAX_AGE_SECONDS,
  },
  jwt: {
    maxAge: DEFAULT_TOKEN_MAX_AGE_SECONDS,
  },
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: '이메일',
      credentials: {
        email: { label: '이메일', type: 'email' },
        password: { label: '비밀번호', type: 'password' },
      },
      authorize: authorizeTeacher,
    }),
  ],
  callbacks: {
    async jwt({ token, trigger, user }) {
      if (!token.email) {
        return token;
      }

      const nowTimestampSeconds = Math.floor(Date.now() / 1000);
      const lastSyncedAtSeconds = typeof token.teacherSyncedAt === 'number' ? token.teacherSyncedAt : 0;
      const hasTeacherSnapshot = Boolean(token.teacherId) && Boolean(token.role) && Boolean(token.approvalStatus);
      const shouldSkipDatabaseSync =
        hasTeacherSnapshot &&
        !user &&
        trigger !== 'update' &&
        nowTimestampSeconds - lastSyncedAtSeconds < TEACHER_SESSION_SYNC_INTERVAL_SECONDS;

      if (shouldSkipDatabaseSync) {
        return token;
      }

      const teacher = await findTeacherByEmail(token.email);

      if (!teacher) {
        // 삭제된 계정은 기존 승인 정보를 지워 보호된 화면에 더 이상 들어오지 못하게 한다.
        delete token.teacherId;
        delete token.role;
        delete token.approvalStatus;
        return token;
      }

      token.teacherId = teacher.id;
      token.role = teacher.role;
      token.approvalStatus = teacher.approvalStatus;
      token.name = teacher.name ?? token.name;
      token.teacherSyncedAt = nowTimestampSeconds;

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.teacherId as string | undefined;
        session.user.name = token.name as string | undefined;
        session.user.role = token.role as 'ADMIN' | 'TEACHER' | undefined;
        session.user.approvalStatus = token.approvalStatus as 'PENDING' | 'APPROVED' | 'REJECTED' | undefined;
      }

      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.AUTH_SECRET,
};
