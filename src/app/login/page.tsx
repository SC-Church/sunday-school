import type { Metadata } from 'next';

import AuthCard from '@/components/common/AuthCard';
import { getChurchNameSafely } from '@/server/settings/church-name';

import LoginForm from './LoginForm';

export const metadata: Metadata = {
  title: '로그인',
};

type LoginPageProps = {
  searchParams?: Promise<{ callback_url?: string | string[] }>;
};

/**
 * 로그인 완료 후 이동할 callback URL을 안전하게 정규화한다.
 */
function getSafeCallbackUrl(callbackUrl: string | string[] | undefined): string {
  const resolvedValue = Array.isArray(callbackUrl) ? callbackUrl[0] : callbackUrl;

  if (!resolvedValue || !resolvedValue.startsWith('/')) {
    return '/';
  }

  return resolvedValue;
}

/**
 * 로그인 페이지를 렌더링하고 callback_url을 로그인 폼으로 전달한다.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const callbackUrl = getSafeCallbackUrl(resolvedSearchParams?.callback_url);
  const churchName = await getChurchNameSafely();

  return (
    <AuthCard
      title={churchName ? `${churchName} 주일학교 교사 로그인` : '교사 로그인'}
      description="가입한 이메일과 비밀번호로 로그인해 주세요."
    >
      <LoginForm callbackUrl={callbackUrl} />
    </AuthCard>
  );
}
