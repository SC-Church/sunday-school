import { describe, expect, it } from 'vitest';

import { normalizeImportHeader, parseImportDate, parseImportRecords } from '@/lib/validation/student-import';

const validRecord = {
  이름: '홍길동',
  성별: '남',
  생년월일: '2016.5.10',
  전화번호: '01012345678',
  주소: '서울',
  보호자성함: '홍엄마',
  보호자관계: '어머니',
  보호자전화번호: '010-2222-3333',
  특이사항: '땅콩 알레르기',
  부서: '유년부',
  반: '4학년',
};

describe('parseImportDate', () => {
  it('여러 날짜 표기를 KST 자정으로 읽는다', () => {
    const expected = '2016-05-09T15:00:00.000Z';
    expect(parseImportDate('2016-05-10')?.toISOString()).toBe(expected);
    expect(parseImportDate('2016.5.10')?.toISOString()).toBe(expected);
    expect(parseImportDate('2016/05/10')?.toISOString()).toBe(expected);
    expect(parseImportDate('20160510')?.toISOString()).toBe(expected);
    expect(parseImportDate('16-05-10')).toBeNull();
    expect(parseImportDate('2016-13-01')).toBeNull();
  });
});

describe('normalizeImportHeader', () => {
  it('공백을 지우고 별칭을 표준 헤더로 바꾼다', () => {
    expect(normalizeImportHeader(' 보호자 명 ')).toBe('보호자성함');
    expect(normalizeImportHeader('연락처')).toBe('전화번호');
    expect(normalizeImportHeader('이름')).toBe('이름');
  });
});

describe('parseImportRecords', () => {
  it('정상 행을 등록용 레코드로 변환한다(성별·관계·전화 정규화)', () => {
    const { rows, errors } = parseImportRecords([validRecord]);

    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      name: '홍길동',
      gender: 'MALE',
      phone: '010-1234-5678',
      address: '서울',
      note: '땅콩 알레르기',
      guardianContact: { name: '홍엄마', relationship: 'MOTHER', phone: '010-2222-3333' },
      departmentName: '유년부',
      className: '4학년',
    });
    expect(rows[0].birthDate.toISOString()).toBe('2016-05-09T15:00:00.000Z');
  });

  it('선택 항목이 비어 있어도 등록되며 주소는 빈 문자열, 나머지는 null', () => {
    const { rows, errors } = parseImportRecords([{ 이름: '김철수', 성별: '여', 생년월일: '2017-01-02' }]);

    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      address: '',
      phone: null,
      note: null,
      guardianContact: null,
      departmentName: null,
      className: null,
    });
  });

  it('필수 항목이 잘못되면 행 번호(엑셀 기준)와 함께 오류를 낸다', () => {
    const { rows, errors } = parseImportRecords([
      validRecord,
      { ...validRecord, 이름: '', 성별: '중', 생년월일: '2016-5' },
    ]);

    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0].rowNumber).toBe(3);
    expect(errors[0].message).toContain('이름');
    expect(errors[0].message).toContain('성별');
    expect(errors[0].message).toContain('생년월일');
  });

  it('보호자 정보가 일부만 있거나 관계·전화 형식이 틀리면 오류다', () => {
    expect(parseImportRecords([{ ...validRecord, 보호자전화번호: '' }]).errors[0].message).toContain('보호자 정보');
    expect(parseImportRecords([{ ...validRecord, 보호자관계: '삼촌' }]).errors[0].message).toContain('보호자관계');
    expect(parseImportRecords([{ ...validRecord, 보호자전화번호: '02-123-4567' }]).errors[0].message).toContain(
      '보호자 전화번호'
    );
  });

  it('부서와 반은 함께 있어야 한다', () => {
    expect(parseImportRecords([{ ...validRecord, 반: '' }]).errors[0].message).toContain('부서와 반');
  });

  it('별칭 헤더(보호자명, 연락처 등)도 인식한다', () => {
    const { rows, errors } = parseImportRecords([
      {
        성명: '이영희',
        성별: 'F',
        생일: '2015-03-01',
        연락처: '010-9999-8888',
        보호자명: '이엄마',
        관계: '모',
        보호자연락처: '010-1111-2222',
      },
    ]);

    expect(errors).toEqual([]);
    expect(rows[0].name).toBe('이영희');
    expect(rows[0].gender).toBe('FEMALE');
    expect(rows[0].guardianContact?.relationship).toBe('MOTHER');
  });
});
