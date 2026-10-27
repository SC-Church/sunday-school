import { after } from 'next/server';

import { readDatasetFresh } from './dataset';

/**
 * 응답을 보낸 뒤 백그라운드에서 시트를 다시 읽어 캐시를 데운다.
 * 쓰기 직후 사용자가 다음 화면으로 넘어갈 때 기다리지 않게 하기 위한 것이다.
 * 요청 컨텍스트 밖(스크립트 등)에서는 after()가 실패하므로 조용히 건너뛴다.
 */
export function scheduleDatasetWarmup(): void {
  try {
    after(async () => {
      try {
        await readDatasetFresh();
      } catch {
        // 데우기 실패는 다음 조회가 직접 읽으면 되므로 무시한다.
      }
    });
  } catch {
    // 요청 범위 밖에서는 예열하지 않는다.
  }
}
