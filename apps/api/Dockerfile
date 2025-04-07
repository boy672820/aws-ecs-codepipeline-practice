# 빌드 스테이지
FROM --platform=linux/amd64 node:22-alpine AS build

WORKDIR /app

# 패키지 파일 복사 및 의존성 설치
COPY package*.json ./
RUN npm ci

# 소스 코드 복사
COPY . .

# 애플리케이션 빌드
RUN npm run build

# 프로덕션 스테이지
FROM --platform=linux/amd64 node:22-alpine AS production

WORKDIR /app

# 빌드 스테이지에서 필요한 파일만 복사
COPY --from=build /app/package*.json ./
COPY --from=build /app/dist ./dist

# 프로덕션 의존성만 설치
RUN npm ci --only=production

# 환경 변수 설정
ENV NODE_ENV=production
ENV PORT=3000

# 포트 노출
EXPOSE 3000

# 애플리케이션 실행
CMD ["node", "dist/apps/api/main"]