import { randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';

// 비밀번호 해시/검증 유틸. Node 내장 scrypt를 쓰며, 파라미터를 해시 문자열에 함께 저장해 나중에 강도를 올려도 기존 해시를 검증할 수 있다.
// 저장 형식: scrypt$<N>$<r>$<p>$<salt(base64)>$<hash(base64)>

const HASH_SCHEME = 'scrypt';
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SALT_BYTES = 16;
const KEY_LENGTH = 64;
// 혼동하기 쉬운 문자(0/O, 1/l/I)를 뺀 임시 비밀번호 문자 집합
const TEMPORARY_PASSWORD_LETTERS = 'abcdefghjkmnpqrstuvwxyz';
const TEMPORARY_PASSWORD_DIGITS = '23456789';
const TEMPORARY_PASSWORD_LENGTH = 10;

/**
 * scrypt를 Promise로 실행한다.
 */
function deriveKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

/**
 * 비밀번호를 무작위 salt와 함께 해시해 저장용 문자열로 만든다.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await deriveKey(password, salt, KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  });

  return [
    HASH_SCHEME,
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString('base64'),
    derivedKey.toString('base64'),
  ].join('$');
}

/**
 * 비밀번호가 저장된 해시와 일치하는지 상수 시간 비교로 검증한다. 형식이 잘못된 해시는 불일치로 처리한다.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [scheme, cost, blockSize, parallelization, saltText, hashText] = storedHash.split('$');

  if (scheme !== HASH_SCHEME || !saltText || !hashText) {
    return false;
  }

  const expectedKey = Buffer.from(hashText, 'base64');

  if (expectedKey.length === 0) {
    return false;
  }

  try {
    const derivedKey = await deriveKey(password, Buffer.from(saltText, 'base64'), expectedKey.length, {
      N: Number(cost),
      r: Number(blockSize),
      p: Number(parallelization),
    });

    return timingSafeEqual(derivedKey, expectedKey);
  } catch {
    return false;
  }
}

/**
 * 존재하지 않는 계정으로 로그인할 때도 비슷한 시간이 걸리도록 쓰는 가짜 해시.
 * 응답 시간 차이로 가입된 이메일을 알아내는 것을 어렵게 한다.
 */
export const DUMMY_PASSWORD_HASH =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

/**
 * 관리자가 초기화할 때 발급하는 임시 비밀번호를 만든다(영문 소문자 + 숫자, 비밀번호 규칙을 항상 만족).
 */
export function generateTemporaryPassword(): string {
  const allCharacters = TEMPORARY_PASSWORD_LETTERS + TEMPORARY_PASSWORD_DIGITS;
  const characters = [
    TEMPORARY_PASSWORD_LETTERS[randomInt(TEMPORARY_PASSWORD_LETTERS.length)],
    TEMPORARY_PASSWORD_DIGITS[randomInt(TEMPORARY_PASSWORD_DIGITS.length)],
  ];

  while (characters.length < TEMPORARY_PASSWORD_LENGTH) {
    characters.push(allCharacters[randomInt(allCharacters.length)]);
  }

  // 첫 두 글자 위치가 고정되지 않도록 섞는다(Fisher-Yates).
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }

  return characters.join('');
}
