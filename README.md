# together-ledger-server

Together Ledger 앱의 데이터 동기화를 담당하는 백엔드 서버입니다.

## 기술 스택

- **Runtime:** Node.js >= 20
- **Framework:** Express
- **Database:** PostgreSQL
- **Auth:** JWT + bcryptjs

## 주요 기능

- 회원 인증 (회원가입 / 로그인)
- 가계부 데이터 동기화

## 시작하기

```bash
# 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env

# 개발 서버 실행
npm run dev

# 프로덕션 실행
npm start
```

## 환경변수

| 변수명 | 설명 |
|---|---|
| `PORT` | 서버 포트 (기본값: 3000) |
| `JWT_SECRET` | JWT 서명 시크릿 키 |
| `DB_PATH` | 데이터베이스 경로 |
| `MAX_ACCOUNTS_PER_DEVICE` | 디바이스당 최대 계정 수 |
