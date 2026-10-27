import { ImageResponse } from 'next/og';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const contentType = 'image/png';
export const size = {
  width: 1200,
  height: 630,
};

/**
 * 파일 경로의 이미지를 data URL 문자열로 변환한다.
 */
async function toDataUrl(absolutePath: string): Promise<string> {
  const fileBuffer = await readFile(absolutePath);
  return `data:image/png;base64,${fileBuffer.toString('base64')}`;
}

/**
 * 공유 링크용 OG 이미지를 생성한다.
 */
export default async function OpengraphImage() {
  const logoPath = path.join(process.cwd(), 'public', 'img', 'img_main_logo.png');
  const textLogoPath = path.join(process.cwd(), 'public', 'img', 'img_main_text_logo.png');
  const [logoDataUrl, textLogoDataUrl] = await Promise.all([toDataUrl(logoPath), toDataUrl(textLogoPath)]);

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        background:
          'radial-gradient(circle at 22% 18%, rgba(255,255,255,0.3) 0, rgba(255,255,255,0) 44%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.18) 0, rgba(255,255,255,0) 42%), linear-gradient(145deg, #6495ED 0%, #5287E8 45%, #3F75D8 100%)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(13,31,63,0.14) 100%)',
        }}
      />

      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 22,
          width: '82%',
          height: '78%',
          borderRadius: 32,
          border: '1px solid rgba(255,255,255,0.36)',
          background: 'rgba(255,255,255,0.12)',
          boxShadow: '0 28px 58px rgba(16, 44, 92, 0.26)',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoDataUrl} width={260} height={260} alt="송촌장로교회 주일학교 로고" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={textLogoDataUrl} width={520} height={106} alt="송촌장로교회 주일학교" />
      </div>
    </div>,
    size
  );
}
