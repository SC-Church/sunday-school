'use client';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

// global-error는 자체 문서를 렌더링해 globals.css가 적용되지 않으므로 색상을 인라인으로 지정한다.
const COLOR_SURFACE = '#ffffff';
const COLOR_TEXT = '#13233f';
const COLOR_MUTED = '#5e7296';
const COLOR_PRIMARY = '#6495ed';

/**
 * 루트 레이아웃까지 실패했을 때의 최종 오류 화면을 렌더링한다.
 * error.tsx는 같은 세그먼트의 레이아웃 오류를 잡지 못하므로 이 파일이 필요하다.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  /**
   * 화면 전체를 다시 렌더링한다.
   */
  const handleRetry = () => {
    reset();
  };

  return (
    <html lang="ko">
      <body style={{ margin: 0, backgroundColor: COLOR_SURFACE }}>
        <title>문제가 발생했습니다 | 송촌장로교회 주일학교 관리 시스템</title>
        <main
          style={{
            minHeight: '100dvh',
            display: 'grid',
            placeItems: 'center',
            padding: '24px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: COLOR_TEXT,
          }}
        >
          <section style={{ maxWidth: '400px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>문제가 발생했습니다</h1>
            <p style={{ marginTop: '12px', fontSize: '14px', color: COLOR_MUTED, whiteSpace: 'pre-line' }}>
              {`잠시 후 다시 시도해 주세요.\n같은 화면이 계속 나오면 관리자에게 알려 주세요.`}
              {error.digest ? `\n오류 코드: ${error.digest}` : ''}
            </p>
            <button
              type="button"
              onClick={handleRetry}
              style={{
                marginTop: '32px',
                width: '100%',
                padding: '12px 16px',
                fontSize: '14px',
                fontWeight: 600,
                color: COLOR_SURFACE,
                backgroundColor: COLOR_PRIMARY,
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              다시 시도
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
