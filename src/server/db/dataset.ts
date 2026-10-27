import {
  SHEET_TABLES,
  type SheetRecordByKey,
  type SheetRow,
  type SheetTableKey,
  parseTableValues,
} from './sheet-schema';
import { readSheets } from './sheets-client';

// 스프레드시트 전체를 한 번에 읽어 인스턴스 메모리에 잠시 보관하는 캐시.
// Apps Script 읽기 1회가 2~5초 걸리므로, 조회 화면은 이 캐시를 읽고 쓰기 작업만 새로 읽는다.

/** 캐시 유효 시간. 이 시간 안의 화면 전환은 시트를 다시 읽지 않는다. */
export const DATASET_CACHE_TTL_MS = 20_000;

export const TABLE_KEYS = Object.keys(SHEET_TABLES) as SheetTableKey[];

export type DatasetTables = { [K in SheetTableKey]: SheetRow<SheetRecordByKey[K]>[] };

export type Dataset = {
  /** 읽은 시점의 시트 revision(쓰기 충돌 검사용) */
  revision: number;
  /** 읽은 시각(ms) */
  loadedAt: number;
  tables: DatasetTables;
};

let cachedDataset: Dataset | null = null;
let inFlightRead: Promise<Dataset> | null = null;

/**
 * 시트 전체를 새로 읽어 파싱하고 캐시에 넣는다. 동시에 여러 요청이 들어오면 한 번만 읽는다.
 */
export function readDatasetFresh(): Promise<Dataset> {
  if (inFlightRead) {
    return inFlightRead;
  }

  inFlightRead = (async () => {
    try {
      const { revision, valueRanges } = await readSheets(TABLE_KEYS.map((key) => SHEET_TABLES[key].title));
      const tables = {} as DatasetTables;

      TABLE_KEYS.forEach((key, index) => {
        const values = valueRanges[index];

        if (!values) {
          throw new Error(`'${SHEET_TABLES[key].title}' 탭이 없습니다. yarn sheets:init을 먼저 실행해 주세요.`);
        }

        // 테이블마다 레코드 타입이 달라 제네릭 SheetTable로 좁혀서 파싱한다.
        (tables as Record<string, unknown>)[key] = parseTableValues(SHEET_TABLES[key] as never, values);
      });

      const dataset: Dataset = { revision, loadedAt: Date.now(), tables };
      cachedDataset = dataset;
      return dataset;
    } finally {
      inFlightRead = null;
    }
  })();

  return inFlightRead;
}

/**
 * 캐시가 살아 있으면 캐시를, 아니면 새로 읽은 데이터셋을 반환한다(조회 화면용).
 */
export function getDataset(): Promise<Dataset> {
  if (cachedDataset && Date.now() - cachedDataset.loadedAt < DATASET_CACHE_TTL_MS) {
    return Promise.resolve(cachedDataset);
  }

  return readDatasetFresh();
}

/**
 * 쓰기 직후 호출한다. 캐시를 비워 다음 조회가 새 데이터를 읽게 한다.
 */
export function invalidateDataset(): void {
  cachedDataset = null;
}

/**
 * 테이블의 레코드 배열만 꺼낸다(행 번호 제외).
 */
export function recordsOf<K extends SheetTableKey>(dataset: Dataset, key: K): SheetRecordByKey[K][] {
  return dataset.tables[key].map((row) => row.record);
}
