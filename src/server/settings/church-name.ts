import { getStoreSnapshot } from '@/server/db/repository';

/**
 * 설정된 교회 이름을 반환한다. 저장소 오류(시트 미설정 등)가 화면 전체를 막지 않도록 실패하면 null을 돌려준다.
 */
export async function getChurchNameSafely(): Promise<string | null> {
  try {
    return (await getStoreSnapshot()).churchName;
  } catch {
    return null;
  }
}
