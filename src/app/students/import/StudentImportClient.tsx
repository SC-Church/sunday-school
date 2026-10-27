'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { useToast } from '@/components/common/ToastProvider';
import { getButtonClassName } from '@/lib/button';
import { parseCsvRecords } from '@/lib/csv';
import { IMPORT_COLUMNS, IMPORT_REQUIRED_COLUMNS, normalizeImportHeader } from '@/lib/validation/student-import';

type StudentImportClientProps = {
  defaultSchoolYear: number;
};

type RowError = { rowNumber: number; message: string };

type ImportResponse = {
  message: string;
  detail?: string;
  valid_row_count?: number;
  errors?: RowError[];
  created_student_count?: number;
  skipped_duplicate_count?: number;
  created_department_names?: string[];
  created_class_names?: string[];
};

const INPUT_CLASS_NAME =
  'rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)]';

/**
 * 파일을 텍스트로 읽는다. UTF-8로 해석되지 않으면(엑셀 기본 저장 등) EUC-KR로 다시 읽는다.
 */
async function readCsvFileAsText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('euc-kr').decode(buffer);
  }
}

/**
 * CSV 파일 선택 → 미리보기(서버 검증) → 일괄 등록 흐름을 렌더링한다.
 */
export default function StudentImportClient({ defaultSchoolYear }: StudentImportClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [fileName, setFileName] = useState<string | null>(null);
  const [records, setRecords] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);
  const [validRowCount, setValidRowCount] = useState<number | null>(null);
  const [schoolYear, setSchoolYear] = useState(defaultSchoolYear);
  const [shouldCreateMissingGroups, setShouldCreateMissingGroups] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);

  const normalizedHeaders = headers.map(normalizeImportHeader);
  const missingRequiredHeaders = IMPORT_REQUIRED_COLUMNS.filter((column) => !normalizedHeaders.includes(column));
  const unknownHeaders = headers.filter((header) => !IMPORT_COLUMNS.includes(normalizeImportHeader(header) as never));

  /**
   * 서버에 검증(미리보기) 또는 등록을 요청한다.
   */
  async function requestImport(dryRun: boolean): Promise<ImportResponse | null> {
    const response = await fetch('/api/students/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        records,
        school_year: schoolYear,
        create_missing_groups: shouldCreateMissingGroups,
        dry_run: dryRun,
      }),
    });
    const payload = (await response.json().catch(() => null)) as ImportResponse | null;

    if (!response.ok) {
      showToast({
        variant: 'error',
        message: dryRun ? '검증에 실패했습니다.' : '등록에 실패했습니다.',
        description:
          payload?.detail ?? (response.status === 403 ? '관리자 권한이 필요합니다.' : '잠시 후 다시 시도해 주세요.'),
      });
      return null;
    }

    return payload;
  }

  /**
   * 파일을 읽어 파싱하고 서버 검증을 돌린다.
   */
  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    setResult(null);
    setRowErrors([]);
    setValidRowCount(null);

    if (!file) {
      setFileName(null);
      setRecords([]);
      setHeaders([]);
      return;
    }

    const parsed = parseCsvRecords(await readCsvFileAsText(file));
    setFileName(file.name);
    setHeaders(parsed.headers);
    setRecords(parsed.records);

    if (parsed.records.length === 0) {
      showToast({
        variant: 'error',
        message: '데이터 행이 없습니다.',
        description: '헤더 아래에 학생 정보를 입력해 주세요.',
      });
      return;
    }

    setIsBusy(true);
    try {
      const payload = await requestImport(true);
      if (payload) {
        setRowErrors(payload.errors ?? []);
        setValidRowCount(payload.valid_row_count ?? 0);
      }
    } finally {
      setIsBusy(false);
    }
  }

  /**
   * 검증을 통과한 행을 실제로 등록한다.
   */
  async function handleImport() {
    if (isBusy || records.length === 0 || rowErrors.length > 0) {
      return;
    }

    setIsBusy(true);
    try {
      const payload = await requestImport(false);

      if (payload?.message === 'ok') {
        setResult(payload);
        showToast({ variant: 'success', message: `${payload.created_student_count ?? 0}명을 등록했습니다.` });
        router.refresh();
      } else if (payload?.errors) {
        setRowErrors(payload.errors);
      }
    } finally {
      setIsBusy(false);
    }
  }

  const canImport =
    records.length > 0 && rowErrors.length === 0 && missingRequiredHeaders.length === 0 && !isBusy && !result;

  return (
    <div className="mt-6 grid gap-6">
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 text-sm text-[var(--color-text)]">
        <p className="font-semibold">1. 템플릿을 내려받아 엑셀에서 채운 뒤 CSV(UTF-8)로 저장합니다.</p>
        <p className="mt-1 text-[var(--color-muted)]">
          헤더: {IMPORT_COLUMNS.join(', ')} — 필수는 이름·성별·생년월일입니다. 부서·반을 적으면 해당 반에 바로 배정되고,
          없는 부서·반은 자동으로 만들어집니다(아래 옵션). 같은 이름+생년월일 학생은 중복으로 보고 건너뜁니다.
        </p>
        {/* 파일 다운로드(API 응답)라 클라이언트 라우팅 대상이 아니므로 일반 링크를 쓴다. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/students/import/template"
          className={getButtonClassName({ variant: 'secondary', size: 'sm', className: 'mt-3' })}
        >
          템플릿 CSV 내려받기
        </a>
      </section>

      <section className="grid gap-3 rounded-xl border border-[var(--color-border)] p-4">
        <p className="text-sm font-semibold text-[var(--color-text)]">2. 파일을 올리고 검증 결과를 확인합니다.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-[var(--color-text)]">배정 학년도</span>
            <input
              type="number"
              value={schoolYear}
              onChange={(event) => setSchoolYear(Number(event.target.value))}
              className={INPUT_CLASS_NAME}
              min={2000}
              max={2100}
            />
          </label>
          <label className="flex items-center gap-2 self-end rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)]">
            <input
              type="checkbox"
              checked={shouldCreateMissingGroups}
              onChange={(event) => setShouldCreateMissingGroups(event.target.checked)}
              className="h-4 w-4"
            />
            없는 부서·반 자동 생성
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-[var(--color-text)]">CSV 파일</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="text-sm text-[var(--color-muted)]"
            />
          </label>
        </div>

        {fileName ? (
          <div className="grid gap-2 text-sm">
            <p className="text-[var(--color-muted)]">
              {fileName} · 데이터 {records.length}행{validRowCount !== null ? ` · 등록 가능 ${validRowCount}행` : ''}
              {rowErrors.length > 0 ? ` · 오류 ${rowErrors.length}행` : ''}
            </p>
            {missingRequiredHeaders.length > 0 ? (
              <p className="rounded-lg bg-[var(--color-danger-soft)] px-3 py-2 text-[var(--color-danger)]">
                필수 헤더가 없습니다: {missingRequiredHeaders.join(', ')}
              </p>
            ) : null}
            {unknownHeaders.length > 0 ? (
              <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2 text-[var(--color-muted)]">
                인식하지 못한 헤더는 무시됩니다: {unknownHeaders.join(', ')}
              </p>
            ) : null}
            {rowErrors.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-[var(--color-danger)]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--color-danger-soft)] text-[var(--color-danger)]">
                    <tr>
                      <th className="px-3 py-2">행</th>
                      <th className="px-3 py-2">오류</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowErrors.map((rowError) => (
                      <tr key={rowError.rowNumber} className="border-t border-[var(--color-border)]">
                        <td className="px-3 py-2 text-[var(--color-muted)]">{rowError.rowNumber}행</td>
                        <td className="px-3 py-2 text-[var(--color-text)]">{rowError.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="px-3 py-2 text-xs text-[var(--color-muted)]">
                  오류가 있는 동안에는 한 행도 등록되지 않습니다. 파일을 고쳐 다시 올려 주세요.
                </p>
              </div>
            ) : null}
            {records.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--color-surface-soft)]">
                    <tr>
                      <th className="px-2 py-1.5">행</th>
                      {headers.map((header) => (
                        <th key={header} className="whitespace-nowrap px-2 py-1.5">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.slice(0, 10).map((record, index) => (
                      <tr key={index} className="border-t border-[var(--color-border)]">
                        <td className="px-2 py-1.5 text-[var(--color-muted)]">{index + 2}</td>
                        {headers.map((header) => (
                          <td key={header} className="whitespace-nowrap px-2 py-1.5 text-[var(--color-text)]">
                            {record[header]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {records.length > 10 ? (
                  <p className="px-2 py-1.5 text-xs text-[var(--color-muted)]">… 외 {records.length - 10}행</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] p-4">
        <p className="text-sm font-semibold text-[var(--color-text)]">3. 검증을 통과하면 등록합니다.</p>
        <button
          type="button"
          onClick={handleImport}
          disabled={!canImport}
          className={getButtonClassName({ variant: 'primary' })}
        >
          {isBusy ? '처리 중...' : result ? '등록 완료' : `${validRowCount ?? 0}명 등록`}
        </button>
      </section>

      {result ? (
        <section className="rounded-xl border border-[var(--color-primary)] bg-[var(--color-primary-soft)] p-4 text-sm text-[var(--color-text)]">
          <p className="font-semibold">등록 결과</p>
          <ul className="mt-2 list-disc pl-5">
            <li>등록한 학생: {result.created_student_count ?? 0}명</li>
            <li>중복으로 건너뛴 학생: {result.skipped_duplicate_count ?? 0}명</li>
            {result.created_department_names?.length ? (
              <li>새로 만든 부서: {result.created_department_names.join(', ')}</li>
            ) : null}
            {result.created_class_names?.length ? <li>새로 만든 반: {result.created_class_names.join(', ')}</li> : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
