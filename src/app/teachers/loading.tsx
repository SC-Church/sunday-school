import PageSkeleton from '@/components/common/PageSkeleton';

/**
 * 데이터 로딩 중 보여줄 스켈레톤. 시트 읽기(수 초)가 걸려도 화면이 멈춘 것처럼 보이지 않게 한다.
 */
export default function Loading() {
  return <PageSkeleton />;
}
