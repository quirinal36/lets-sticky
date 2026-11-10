import { useSyncExternalStore, type ReactElement } from "react";

const MIN_COLUMN = 280;
const GAP = 14;
const MAX_COLUMNS = 5;

function columnCount(): number {
  const width = Math.min(window.innerWidth, 1532) - 32;
  return Math.max(1, Math.min(MAX_COLUMNS, Math.floor((width + GAP) / (MIN_COLUMN + GAP))));
}

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

// CSS columns는 카드 안의 팝오버 메뉴를 단 사이에서 잘라 버려서, 열을 직접 나눈다.
// 왼쪽에서 오른쪽으로 채우므로 최신 글이 항상 윗줄에 온다.
export function Wall({ children }: { children: ReactElement[] }) {
  const count = useSyncExternalStore(subscribe, columnCount);
  const columns: ReactElement[][] = Array.from({ length: count }, () => []);
  children.forEach((child, i) => columns[i % count].push(child));
  return (
    <div className="wall">
      {columns.map((column, i) => (
        <div className="wall-column" key={i}>
          {column}
        </div>
      ))}
    </div>
  );
}
