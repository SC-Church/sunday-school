import type { Metadata } from 'next';

import AuthCard from '@/components/common/AuthCard';
import { getChurchNameSafely } from '@/server/settings/church-name';

import SignupForm from './SignupForm';

export const metadata: Metadata = {
  title: '회원가입',
};

/**
 * 교사 회원가입 페이지를 렌더링한다.
 */
export default async function SignupPage() {
  const churchName = await getChurchNameSafely();

  return (
    <AuthCard
      title={churchName ? `${churchName} 주일학교 교사 회원가입` : '교사 회원가입'}
      description="가입 신청 후 관리자가 승인하면 서비스를 이용할 수 있습니다."
    >
      <SignupForm />
    </AuthCard>
  );
}
