# 기업 이메일 통합 관리 시스템

기업 환경을 위한 풀스택 이메일 통합 관리 시스템입니다. Gmail OAuth2, IMAP/SMTP를 지원하며 다중 계정을 통합 관리합니다.

## 기술 스택

- **백엔드**: Node.js + Express + TypeScript
- **프론트엔드**: React + TypeScript + Tailwind CSS
- **데이터베이스**: SQLite (better-sqlite3)
- **빌드 도구**: Vite (클라이언트), ts-node-dev (서버)

## 주요 기능

### 다중 계정 관리
- Gmail OAuth2 연동 (access token + refresh token 자동 갱신)
- IMAP/SMTP 계정 추가 (SSL/TLS 지원)
- 통합 받은편지함 (모든 계정의 이메일을 한 곳에서)
- 계정별 받은편지함 뷰

### 이메일 작업
- 이메일 목록 / 읽기 (스레드 뷰)
- 편지 작성 / 전송
- 답장, 전체 답장, 전달
- 임시저장 (자동 30초 간격)
- 읽음/읽지 않음 표시
- 중요 표시 (⭐)
- 삭제, 보관

### 조직화
- 시스템 라벨 (받은편지함, 보낸편지함, 임시보관함 등)
- 사용자 정의 라벨 관리
- 이메일에 라벨 적용
- 전문 검색 (FTS5 기반)

### 기업 기능
- 이메일 템플릿 (카테고리별 관리)
- 계정별 서명 관리
- 우선순위 받은편지함
- 일괄 이메일 작업

## 설치 방법

### 1. 의존성 설치

```bash
# 서버 의존성
cd server
npm install

# 클라이언트 의존성
cd ../client
npm install
```

### 2. 환경 변수 설정

```bash
cp .env.example server/.env
```

`server/.env` 파일을 편집하여 필요한 값들을 설정합니다.

### 3. Gmail OAuth2 설정 (선택사항)

Gmail 계정을 사용하려면:

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트 생성
2. APIs & Services → Credentials → OAuth 2.0 Client ID 생성 (Web application)
3. Authorized redirect URIs에 `http://localhost:3001/api/accounts/oauth/callback` 추가
4. Gmail API 활성화
5. `server/.env`에 Client ID와 Client Secret 설정

### 4. 개발 서버 실행

```bash
# 루트 디렉토리에서 (서버 + 클라이언트 동시 실행)
npm run dev

# 또는 개별 실행
cd server && npm run dev   # 백엔드 (포트 3001)
cd client && npm run dev   # 프론트엔드 (포트 5173)
```

### 5. 빌드

```bash
npm run build
```

## API 엔드포인트

### 계정 (`/api/accounts`)
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/` | 계정 목록 |
| GET | `/:id` | 계정 조회 |
| GET | `/oauth/url` | Gmail OAuth URL |
| GET | `/oauth/callback` | OAuth 콜백 |
| POST | `/` | IMAP 계정 추가 |
| PUT | `/:id` | 계정 수정 |
| DELETE | `/:id` | 계정 삭제 |
| POST | `/:id/sync` | 이메일 동기화 |

### 이메일 (`/api/emails`)
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/` | 이메일 목록 (스레드) |
| GET | `/:id` | 이메일 조회 |
| GET | `/thread/:threadId` | 스레드 조회 |
| POST | `/send` | 이메일 전송 |
| PATCH | `/:id/read` | 읽음 표시 |
| PATCH | `/:id/star` | 중요 표시 |
| PATCH | `/:id/archive` | 보관 |
| DELETE | `/:id` | 삭제 |
| POST | `/:id/labels` | 라벨 추가 |
| DELETE | `/:id/labels/:labelId` | 라벨 제거 |
| GET | `/search/results` | 이메일 검색 |
| POST | `/batch` | 일괄 작업 |

### 라벨 (`/api/labels`)
- CRUD 작업 지원

### 임시저장 (`/api/drafts`)
- CRUD 작업 지원

### 템플릿 (`/api/templates`)
- CRUD 작업 지원

## 프로젝트 구조

```
email/
├── server/                 # 백엔드
│   ├── src/
│   │   ├── index.ts        # Express 앱 진입점
│   │   ├── db/
│   │   │   ├── database.ts # DB 연결
│   │   │   └── schema.ts   # DB 스키마 및 시드 데이터
│   │   ├── routes/
│   │   │   ├── accounts.ts
│   │   │   ├── emails.ts
│   │   │   ├── labels.ts
│   │   │   ├── drafts.ts
│   │   │   └── templates.ts
│   │   ├── services/
│   │   │   ├── gmail.ts    # Gmail API 서비스
│   │   │   └── imap.ts     # IMAP/SMTP 서비스
│   │   ├── middleware/
│   │   │   ├── errorHandler.ts
│   │   │   └── validate.ts
│   │   └── types/
│   │       └── index.ts
│   └── data/               # SQLite DB 파일 위치
│
├── client/                 # 프론트엔드
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── api/
│   │   │   └── client.ts   # API 클라이언트
│   │   ├── components/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── EmailList.tsx
│   │   │   ├── EmailDetail.tsx
│   │   │   ├── ComposeModal.tsx
│   │   │   ├── AccountModal.tsx
│   │   │   ├── LabelsPanel.tsx
│   │   │   └── TemplatesPanel.tsx
│   │   ├── hooks/
│   │   │   ├── useEmails.ts
│   │   │   └── useAccounts.ts
│   │   └── types/
│   │       └── index.ts
│   └── ...
│
├── .env.example
├── package.json
└── README.md
```

## 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `PORT` | 서버 포트 | `3001` |
| `NODE_ENV` | 실행 환경 | `development` |
| `CLIENT_URL` | 클라이언트 URL (CORS) | `http://localhost:5173` |
| `DB_PATH` | SQLite DB 경로 | `./data/email.db` |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | - |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | - |
| `GOOGLE_REDIRECT_URI` | OAuth 리다이렉트 URI | - |
