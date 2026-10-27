import { describe, expect, it } from 'vitest';

import { buildCsv, parseCsv, parseCsvRecords, toCsvCell } from '@/lib/csv';

describe('parseCsv', () => {
  it('쉼표·따옴표·줄바꿈이 든 셀과 CRLF, BOM을 처리한다', () => {
    const text = '﻿이름,주소\r\n"홍길동, ""길동""","서울\n강남"\r\n김철수,부산\r\n';

    expect(parseCsv(text)).toEqual([
      ['이름', '주소'],
      ['홍길동, "길동"', '서울\n강남'],
      ['김철수', '부산'],
    ]);
  });

  it('빈 줄은 건너뛰고 마지막 줄바꿈이 없어도 읽는다', () => {
    expect(parseCsv('a,b\n\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('parseCsvRecords', () => {
  it('헤더를 키로 하는 객체를 만들고 값의 공백을 지운다', () => {
    const { headers, records } = parseCsvRecords('이름 , 성별\n 홍길동 , 남 \n김철수');

    expect(headers).toEqual(['이름', '성별']);
    expect(records).toEqual([
      { 이름: '홍길동', 성별: '남' },
      { 이름: '김철수', 성별: '' },
    ]);
  });
});

describe('buildCsv / toCsvCell', () => {
  it('BOM과 CRLF로 만들고 특수문자는 따옴표로 감싼다', () => {
    expect(
      buildCsv([
        ['이름', '메모'],
        ['홍길동', 'a,b'],
        ['김철수', null],
      ])
    ).toBe('﻿이름,메모\r\n홍길동,"a,b"\r\n김철수,\r\n');
    expect(toCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('만든 CSV를 다시 파싱하면 원래 값이 나온다', () => {
    const rows = [
      ['이름', '주소'],
      ['홍길동, "별명"', '서울\n강남'],
    ];
    expect(parseCsv(buildCsv(rows))).toEqual(rows);
  });
});
