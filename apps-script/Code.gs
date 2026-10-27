/**
 * 송촌장로교회 주일학교 관리 시스템 - Google Sheets 저장소 게이트웨이 (Apps Script 웹 앱)
 *
 * 이 파일 전체를 데이터 스프레드시트의 [확장 프로그램 > Apps Script] 편집기(Code.gs)에 붙여 넣는다.
 * 설정 방법은 저장소 README의 "저장소 준비" 절을 따른다. 요약:
 *   1) 편집기 왼쪽 [서비스 +] 에서 "Google Sheets API"를 추가한다.
 *   2) [프로젝트 설정 > 스크립트 속성]에 API_TOKEN(앱의 APPS_SCRIPT_TOKEN과 같은 값)을 추가한다.
 *   3) [배포 > 새 배포 > 웹 앱]: 실행 사용자 "나", 액세스 권한 "모든 사용자"로 배포하고 URL을 APPS_SCRIPT_URL에 넣는다.
 *   코드를 고친 뒤에는 [배포 > 배포 관리 > 수정 > 버전: 새 버전]으로 다시 배포해야 반영된다.
 *
 * 요청(JSON, POST):
 *   { token, action: 'read', titles: string[] }
 *     -> { ok, revision, sheetIds: {title: sheetId}, valueRanges: (string[][] | null)[] }
 *   { token, action: 'write', requests: SheetsBatchUpdateRequest[], expectedRevision: number | null }
 *     -> { ok, revision } | { ok: false, error: 'conflict', revision }
 *
 * 동시성: 쓰기는 스크립트 잠금으로 한 번에 하나씩 처리하고, 쓸 때마다 revision을 1 올린다.
 * 앱은 읽을 때 받은 revision을 expectedRevision으로 보내며, 그 사이 다른 쓰기가 있었으면 conflict를 받아 다시 읽고 재시도한다.
 */

var PROPERTY_API_TOKEN = 'API_TOKEN';
var PROPERTY_REVISION = 'REVISION';
var LOCK_TIMEOUT_MS = 20000;

/**
 * 웹 앱 POST 진입점. 항상 JSON을 반환한다(Apps Script 웹 앱은 HTTP 상태 코드를 지정할 수 없다).
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var properties = PropertiesService.getScriptProperties();
    var apiToken = properties.getProperty(PROPERTY_API_TOKEN);

    if (!apiToken || body.token !== apiToken) {
      return toJsonOutput({ ok: false, error: 'unauthorized' });
    }

    if (body.action === 'read') {
      return toJsonOutput(readSheets(properties, body.titles || []));
    }

    if (body.action === 'write') {
      return toJsonOutput(writeSheets(properties, body.requests || [], body.expectedRevision));
    }

    return toJsonOutput({ ok: false, error: 'unknown_action' });
  } catch (error) {
    return toJsonOutput({ ok: false, error: String((error && error.message) || error) });
  }
}

/**
 * 탭 목록(sheetId)과 요청한 탭의 표시값을 읽는다. 없는 탭은 null로 돌려준다.
 * revision을 값보다 먼저 읽는다: 읽는 도중 쓰기가 끼어들면 revision이 낡아 보이므로 이후 쓰기가 conflict로 안전하게 재시도된다.
 */
function readSheets(properties, titles) {
  var revision = Number(properties.getProperty(PROPERTY_REVISION) || '0');
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheetIds = {};

  spreadsheet.getSheets().forEach(function (sheet) {
    sheetIds[sheet.getName()] = sheet.getSheetId();
  });

  var valueRanges = titles.map(function (title) {
    var sheet = spreadsheet.getSheetByName(title);

    if (!sheet) {
      return null;
    }
    if (sheet.getLastRow() === 0) {
      return [];
    }

    return sheet.getDataRange().getDisplayValues();
  });

  return { ok: true, revision: revision, sheetIds: sheetIds, valueRanges: valueRanges };
}

/**
 * 스크립트 잠금 안에서 revision을 확인하고 Sheets API batchUpdate(원자적)로 반영한다.
 * expectedRevision이 null이면 확인을 건너뛴다(초기화/이전 스크립트용).
 */
function writeSheets(properties, requests, expectedRevision) {
  var lock = LockService.getScriptLock();

  if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
    return { ok: false, error: 'lock_timeout' };
  }

  try {
    var currentRevision = Number(properties.getProperty(PROPERTY_REVISION) || '0');

    if (expectedRevision !== null && expectedRevision !== undefined && expectedRevision !== currentRevision) {
      return { ok: false, error: 'conflict', revision: currentRevision };
    }

    var nextRevision = currentRevision + 1;
    // 쓰기 전에 revision을 먼저 올린다. 쓰기가 실패해도 다른 요청이 불필요하게 한 번 재시도할 뿐 데이터는 안전하다.
    properties.setProperty(PROPERTY_REVISION, String(nextRevision));

    if (requests.length > 0) {
      Sheets.Spreadsheets.batchUpdate({ requests: requests }, SpreadsheetApp.getActiveSpreadsheet().getId());
    }

    return { ok: true, revision: nextRevision };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 객체를 JSON 응답으로 만든다.
 */
function toJsonOutput(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
