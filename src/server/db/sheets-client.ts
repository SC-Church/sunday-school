import type { SheetBatchRequest } from './sheet-requests';

// 스프레드시트에 붙인 Apps Script 웹 앱(apps-script/Code.gs)을 호출하는 전송 계층.
// Google Cloud 콘솔 설정 없이, 스크립트가 스프레드시트 소유자 권한으로 실행된다.

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_TRANSPORT_RETRY_COUNT = 2;
const BASE_RETRY_DELAY_MS = 500;

type AppsScriptConfig = {
  url: string;
  token: string;
};

type AppsScriptFailure = {
  ok: false;
  error: string;
  revision?: number;
};

type ReadResponse = {
  ok: true;
  revision: number;
  sheetIds: Record<string, number>;
  valueRanges: Array<string[][] | null>;
};

type WriteResponse = {
  ok: true;
  revision: number;
};

/** 읽은 뒤 다른 쓰기가 먼저 반영되어 이번 쓰기가 거절되었을 때 발생한다. 다시 읽고 재시도하면 된다. */
export class WriteConflictError extends Error {
  constructor() {
    super('다른 저장이 먼저 반영되어 다시 시도해야 합니다.');
    this.name = 'WriteConflictError';
  }
}

let cachedSheetIdByTitle: Map<string, number> | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();

/**
 * 환경변수에서 Apps Script 웹 앱 설정을 읽는다. 누락 시 어떤 값이 없는지 알려주는 오류를 던진다.
 */
function getAppsScriptConfig(): AppsScriptConfig {
  const url = process.env.APPS_SCRIPT_URL;
  const token = process.env.APPS_SCRIPT_TOKEN;
  const missingKeys = [
    ['APPS_SCRIPT_URL', url],
    ['APPS_SCRIPT_TOKEN', token],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingKeys.length > 0) {
    throw new Error(`Apps Script 환경변수가 설정되지 않았습니다: ${missingKeys.join(', ')}`);
  }

  return { url: url!, token: token! };
}

/**
 * 지정한 시간만큼 기다린다.
 */
function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * Apps Script 웹 앱에 요청을 보낸다. 잠금 대기 초과(적용되지 않았음이 확실)는 항상 재시도한다.
 * 네트워크 오류·5xx는 읽기에서만 재시도한다 — 쓰기는 실제로 반영된 뒤 응답만 실패했을 수 있어 재시도하면 두 번 반영된다.
 * 웹 앱 응답은 script.googleusercontent.com 일회용 주소로 리다이렉트되므로 fetch의 리다이렉트 추적(기본값)이 필요하다.
 */
async function callAppsScript<T>(
  payload: Record<string, unknown>,
  { canRetryTransportError }: { canRetryTransportError: boolean }
): Promise<T | AppsScriptFailure> {
  const config = getAppsScriptConfig();

  for (let attempt = 0; ; attempt += 1) {
    let responseText: string;

    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, token: config.token }),
        redirect: 'follow',
        cache: 'no-store',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.status >= 500 && canRetryTransportError && attempt < MAX_TRANSPORT_RETRY_COUNT) {
        await delay(BASE_RETRY_DELAY_MS * 2 ** attempt);
        continue;
      }

      responseText = await response.text();
    } catch (error) {
      if (canRetryTransportError && attempt < MAX_TRANSPORT_RETRY_COUNT) {
        await delay(BASE_RETRY_DELAY_MS * 2 ** attempt);
        continue;
      }
      throw error;
    }

    let result: T | AppsScriptFailure;

    try {
      result = JSON.parse(responseText) as T | AppsScriptFailure;
    } catch {
      // 배포 액세스 권한이 "모든 사용자"가 아니면 JSON 대신 구글 로그인 HTML이 온다.
      throw new Error(
        'Apps Script 응답이 JSON이 아닙니다. 웹 앱 배포의 액세스 권한이 "모든 사용자"인지, APPS_SCRIPT_URL이 /exec로 끝나는지 확인해 주세요.'
      );
    }

    const isLockTimeout =
      (result as AppsScriptFailure).ok === false && (result as AppsScriptFailure).error === 'lock_timeout';

    if (isLockTimeout && attempt < MAX_TRANSPORT_RETRY_COUNT) {
      await delay(BASE_RETRY_DELAY_MS * 2 ** attempt);
      continue;
    }

    return result;
  }
}

/**
 * 실패 응답을 오류로 바꿔 던진다.
 */
function throwFailure(failure: AppsScriptFailure): never {
  if (failure.error === 'unauthorized') {
    throw new Error('Apps Script 인증 실패: APPS_SCRIPT_TOKEN과 스크립트 속성 API_TOKEN이 같은지 확인해 주세요.');
  }
  throw new Error(`Apps Script 오류: ${failure.error}`);
}

/**
 * 여러 탭의 표시값을 한 번의 호출로 읽는다. 없는 탭은 null이다.
 * revision은 이후 쓰기에서 동시 저장 여부를 확인하는 데 쓴다.
 */
export async function readSheets(
  titles: ReadonlyArray<string>
): Promise<{ revision: number; valueRanges: Array<string[][] | null> }> {
  const result = await callAppsScript<ReadResponse>({ action: 'read', titles }, { canRetryTransportError: true });

  if (!result.ok) {
    throwFailure(result);
  }

  cachedSheetIdByTitle = new Map(Object.entries(result.sheetIds));
  return { revision: result.revision, valueRanges: result.valueRanges };
}

/**
 * 탭 이름 → sheetId 매핑을 반환한다. 읽기 호출 때마다 갱신되며, 없으면 한 번 조회한다.
 */
export async function getSheetIdByTitle(): Promise<Map<string, number>> {
  if (!cachedSheetIdByTitle) {
    await readSheets([]);
  }

  return cachedSheetIdByTitle!;
}

/**
 * 탭 구조가 바뀌었을 때(초기화 스크립트 등) sheetId 캐시를 비운다.
 */
export function clearSheetIdCache(): void {
  cachedSheetIdByTitle = null;
}

/**
 * batchUpdate 요청을 원자적으로 반영한다.
 * expectedRevision을 주면 그 사이 다른 쓰기가 있었을 때 WriteConflictError를 던진다. null이면 확인하지 않는다.
 */
export async function writeSheets(
  requests: ReadonlyArray<SheetBatchRequest | object>,
  expectedRevision: number | null
): Promise<void> {
  if (requests.length === 0) {
    return;
  }

  const result = await callAppsScript<WriteResponse>(
    { action: 'write', requests, expectedRevision },
    { canRetryTransportError: false }
  );

  if (!result.ok) {
    if (result.error === 'conflict') {
      throw new WriteConflictError();
    }
    throwFailure(result);
  }
}

/**
 * 같은 서버 인스턴스 안의 쓰기 작업을 한 줄로 세워 실행한다(인스턴스 간 충돌은 revision 확인이 막는다).
 */
export function runExclusiveWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation);
  writeQueue = result.catch(() => undefined);
  return result;
}
