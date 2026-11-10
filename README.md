# Sticky

수업 자료와 링크를 포스트잇처럼 붙여 공유하는 보드입니다. 로그인 없이 글·이미지·링크·파일을 올리고 내려받을 수 있고, 관리자는 설문을 만들어 응답을 모을 수 있습니다.

https://memo.letscoding.kr

## 구성

- `src/` — React 클라이언트 (Vite)
- `worker/` — Hono API (Cloudflare Workers)
- D1 `lets-sticky` — 보드, 게시물, 설문, 응답
- R2 `lets-sticky-files` — 첨부 파일

테이블은 Worker가 처음 요청을 받을 때 스스로 만듭니다(`worker/schema.ts`). 별도 마이그레이션 단계는 없습니다.

## 개발

```sh
npm install
echo 'ADMIN_PASSWORD=dev-password' > .dev.vars
npm run dev
```

로컬에서는 D1과 R2가 `.wrangler/` 아래에 시뮬레이션됩니다.

## 배포

`main` 브랜치에 push 하면 Cloudflare Workers Builds가 `npm run build` → `npx wrangler deploy` 를 실행합니다.

관리자 비밀번호는 Worker의 `ADMIN_PASSWORD` secret 입니다. `/admin` 에서 로그인하면 보드와 설문을 만들고, 게시물을 고정하거나 삭제할 수 있습니다.
