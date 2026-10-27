import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '송촌장로교회 주일학교 관리 시스템',
    short_name: '송촌장로교회 주일학교',
    description: '주일학교 출석, 학생, 교사, 가입 승인을 한 곳에서 관리하는 시스템입니다.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#6495ED',
    icons: [
      {
        src: '/app-icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/app-icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        // 마스커블 전용: 불투명 흰 배경 + 그림을 세이프존(중심 반지름 40%) 안에 배치
        src: '/app-icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
