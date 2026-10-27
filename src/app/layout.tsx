import type { ReactNode } from 'react';

import type { Metadata } from 'next';

import localFont from 'next/font/local';

import { getServerSession } from 'next-auth';

import AppShell from '@/components/layout/AppShell';
import { authOptions } from '@/lib/auth';
import { getChurchNameSafely } from '@/server/settings/church-name';

import './globals.css';
import Providers from './providers';

const pretendard = localFont({
  src: [
    {
      path: '../../public/fonts/Pretendard/woff2-subset/Pretendard-Regular.subset.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/Pretendard/woff2-subset/Pretendard-Medium.subset.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../../public/fonts/Pretendard/woff2-subset/Pretendard-Bold.subset.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
});

function resolveMetadataBase(): URL {
  const configuredSiteUrl =
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
    'http://localhost:3000';

  return new URL(configuredSiteUrl);
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  manifest: '/manifest.webmanifest',
  title: {
    default: '송촌장로교회 주일학교 관리 시스템',
    template: '%s | 송촌장로교회 주일학교 관리 시스템',
  },
  description: '주일학교 출석, 학생, 교사, 가입 승인을 한 곳에서 관리하는 시스템입니다.',
  icons: {
    icon: [
      { url: '/app-icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/app-icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/app-icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: '송촌장로교회 주일학교 관리 시스템',
    description: '주일학교 출석, 학생, 교사, 가입 승인을 한 곳에서 관리하는 시스템입니다.',
    type: 'website',
    locale: 'ko_KR',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: '송촌장로교회 주일학교 관리 시스템',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '송촌장로교회 주일학교 관리 시스템',
    description: '주일학교 출석, 학생, 교사, 가입 승인을 한 곳에서 관리하는 시스템입니다.',
    images: ['/opengraph-image'],
  },
};

/**
 * 앱 전체 공통 레이아웃을 렌더링한다.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const session = await getServerSession(authOptions);
  const userDisplayName = session?.user?.name ?? session?.user?.email ?? '';
  // 로그인한 사용자에게만 저장소를 읽는다(게스트 화면은 저장소를 조회하지 않는다는 원칙).
  const churchName = session?.user?.id ? await getChurchNameSafely() : null;

  return (
    <html lang="ko" className={pretendard.className}>
      <body>
        <Providers>
          <AppShell
            role={session?.user?.role}
            approvalStatus={session?.user?.approvalStatus}
            userDisplayName={userDisplayName}
            churchName={churchName}
          >
            {children}
          </AppShell>
        </Providers>
      </body>
    </html>
  );
}
