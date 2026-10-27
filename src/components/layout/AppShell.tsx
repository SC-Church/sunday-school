'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { faBars, faMoon, faSun } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import SignOutButton from '@/components/common/SignOutButton';
import { getMenuItemsByRole } from '@/lib/menu-items';
import type { TeacherApprovalStatus, TeacherRole } from '@/types/teacher';

type AppShellProps = {
  children: ReactNode;
  role?: TeacherRole;
  approvalStatus?: TeacherApprovalStatus;
  userDisplayName: string;
  /** 관리자가 설정한 교회 이름. 없으면 기본 로고 이미지를 쓴다. */
  churchName: string | null;
};

type ThemeMode = 'light' | 'dark';

const THEME_MODE_STORAGE_KEY = 'theme_mode';
const THEME_MODE_CHANGE_EVENT_NAME = 'theme-mode-change';

/**
 * 브라우저 저장소에서 현재 테마 모드를 읽어온다.
 */
function getThemeModeSnapshot(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'light';
  }

  return window.localStorage.getItem(THEME_MODE_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
}

/**
 * 서버 렌더링 시 사용할 기본 테마 모드를 반환한다.
 */
function getThemeModeServerSnapshot(): ThemeMode {
  return 'light';
}

/**
 * 테마 모드 변경 이벤트를 구독한다.
 */
function subscribeThemeMode(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === THEME_MODE_STORAGE_KEY) {
      onStoreChange();
    }
  };

  const handleThemeModeChange = () => {
    onStoreChange();
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(THEME_MODE_CHANGE_EVENT_NAME, handleThemeModeChange);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(THEME_MODE_CHANGE_EVENT_NAME, handleThemeModeChange);
  };
}

/**
 * 메뉴 URL이 현재 경로와 일치하는지 확인한다.
 */
function isActiveMenu(pathname: string, url: string): boolean {
  if (url.startsWith('http')) {
    return false;
  }

  return pathname === url || pathname.startsWith(`${url}/`);
}

/**
 * 앱 공통 헤더와 반응형 메뉴 셸을 렌더링한다.
 */
export default function AppShell({ children, role, approvalStatus, userDisplayName, churchName }: AppShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const themeMode = useSyncExternalStore(subscribeThemeMode, getThemeModeSnapshot, getThemeModeServerSnapshot);
  const isDarkMode = themeMode === 'dark';
  const pathname = usePathname();
  const isSignedIn = Boolean(role);
  const isAdmin = role === 'ADMIN';
  const isApproved = approvalStatus === 'APPROVED';
  const isHomePage = pathname === '/';
  const shouldShowMenu = isSignedIn && isApproved && !isHomePage;
  const menuItems = useMemo(() => getMenuItemsByRole(role), [role]);
  const headerDisplayName = userDisplayName
    ? userDisplayName.endsWith('님')
      ? userDisplayName
      : `${userDisplayName}님`
    : '';

  useEffect(() => {
    document.documentElement.classList.toggle('theme-dark', isDarkMode);
  }, [isDarkMode]);

  /**
   * 모바일 메뉴 열림/닫힘 상태를 토글한다.
   */
  const handleToggleMobileMenu = () => {
    setIsMobileMenuOpen((prevState) => !prevState);
  };

  /**
   * 모바일 메뉴를 닫는다.
   */
  const handleCloseMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  /**
   * 메뉴 링크 클릭 시 모바일 메뉴를 닫는다.
   */
  const handleClickMenuItem = () => {
    setIsMobileMenuOpen(false);
  };

  /**
   * 다크모드 상태를 전환하고 사용자 설정을 저장한다.
   */
  const handleToggleDarkMode = () => {
    const nextThemeMode: ThemeMode = isDarkMode ? 'light' : 'dark';
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, nextThemeMode);
    window.dispatchEvent(new Event(THEME_MODE_CHANGE_EVENT_NAME));
  };

  return (
    <>
      <header className="sticky top-0 z-50 flex h-[var(--header-height-mobile)] items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 sm:h-[var(--header-height-desktop)] sm:px-6">
        <Link href="/" prefetch={false} className="flex items-center gap-1.5 sm:gap-2">
          {churchName ? (
            <span className="text-lg font-extrabold leading-none tracking-tight text-[var(--color-primary)] sm:text-2xl">
              {churchName}
            </span>
          ) : (
            <Image
              src={isDarkMode ? '/img/img_church_logo_white.png' : '/img/img_church_logo.png'}
              alt="송촌장로교회"
              width={176}
              height={34}
              className="h-6 w-auto sm:h-[30px]"
              priority
            />
          )}
          <span className="text-lg font-extrabold leading-none tracking-tight text-[var(--color-text)] sm:text-2xl">
            주일학교
          </span>
        </Link>

        {isSignedIn ? (
          <div className="flex items-center gap-2 text-sm text-[var(--color-text)] sm:gap-3">
            {shouldShowMenu ? (
              <button
                type="button"
                onClick={handleToggleMobileMenu}
                className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--color-surface)] text-[var(--color-text)] transition hover:bg-[var(--color-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 md:hidden"
                aria-label={isMobileMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
                aria-expanded={isMobileMenuOpen}
              >
                <FontAwesomeIcon icon={faBars} className="text-[24px]" />
              </button>
            ) : null}
            {isAdmin ? (
              <span className="hidden rounded-full border border-[var(--color-primary)] bg-[var(--color-primary-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--color-primary)] sm:inline-flex">
                관리자
              </span>
            ) : null}
            <span className="hidden sm:inline">{headerDisplayName}</span>
            <div className="hidden md:block">
              <SignOutButton />
            </div>
          </div>
        ) : (
          <Link href="/login" prefetch={false} className="btn btn-secondary btn-md">
            로그인
          </Link>
        )}
      </header>

      {shouldShowMenu ? (
        <div className="flex">
          <aside className="sticky top-[var(--header-height-mobile)] hidden h-[calc(100dvh-var(--header-height-mobile))] w-44 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-4 md:flex md:top-[var(--header-height-desktop)] md:h-[calc(100dvh-var(--header-height-desktop))]">
            <nav className="space-y-1">
              {menuItems.map((item) => {
                const active = isActiveMenu(pathname, item.url);
                const isExternal = item.url.startsWith('http');

                return (
                  <Link
                    key={item.label}
                    href={item.url}
                    prefetch={false}
                    target={isExternal ? '_blank' : undefined}
                    rel={isExternal ? 'noreferrer noopener' : undefined}
                    className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium transition ${
                      active
                        ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
                        : 'text-[var(--color-text)] hover:bg-[var(--color-surface-soft)]'
                    }`}
                  >
                    <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <button
              type="button"
              onClick={handleToggleDarkMode}
              className="btn btn-secondary btn-md mt-auto w-full gap-2"
            >
              <FontAwesomeIcon icon={isDarkMode ? faSun : faMoon} className="h-3.5 w-3.5" />
              {isDarkMode ? '라이트 모드' : '다크 모드'}
            </button>
          </aside>

          <div className="min-w-0 flex-1">{children}</div>
        </div>
      ) : (
        children
      )}

      {shouldShowMenu && isMobileMenuOpen ? (
        <div className="fixed inset-x-0 bottom-0 top-[var(--header-height-mobile)] z-40 md:hidden sm:top-[var(--header-height-desktop)]">
          <button
            type="button"
            className="absolute inset-0"
            style={{ backgroundColor: 'rgb(var(--color-dim-rgb) / 0.62)' }}
            onClick={handleCloseMobileMenu}
            aria-label="메뉴 닫기"
          />
          <aside className="relative ml-auto flex h-full w-48 max-w-[64vw] flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <nav className="space-y-1">
              {menuItems.map((item) => {
                const active = isActiveMenu(pathname, item.url);
                const isExternal = item.url.startsWith('http');

                return (
                  <Link
                    key={item.label}
                    href={item.url}
                    prefetch={false}
                    target={isExternal ? '_blank' : undefined}
                    rel={isExternal ? 'noreferrer noopener' : undefined}
                    onClick={handleClickMenuItem}
                    className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium transition ${
                      active
                        ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
                        : 'text-[var(--color-text)] hover:bg-[var(--color-surface-soft)]'
                    }`}
                  >
                    <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto pt-3">
              {isAdmin ? (
                <div className="mb-2 flex items-center justify-start gap-2">
                  <span className="inline-flex rounded-full border border-[var(--color-primary)] bg-[var(--color-primary-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--color-primary)]">
                    관리자
                  </span>
                  <p className="text-left text-sm font-medium text-[var(--color-text)]">{userDisplayName}</p>
                </div>
              ) : (
                <p className="mb-2 text-left text-sm font-medium text-[var(--color-text)]">{userDisplayName}</p>
              )}
              <button
                type="button"
                onClick={handleToggleDarkMode}
                className="btn btn-secondary btn-sm mb-2 w-full gap-1"
              >
                <FontAwesomeIcon icon={isDarkMode ? faSun : faMoon} className="h-2.5 w-2.5" />
                {isDarkMode ? '라이트 모드' : '다크 모드'}
              </button>
              <SignOutButton className="h-8 w-full rounded-md px-2 py-1.5 text-[8px] font-medium" />
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
