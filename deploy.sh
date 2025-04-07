#!/bin/bash
set -e

# 환경 변수 설정
AWS_REGION="ap-northeast-2"  # 서울 리전
ECR_REPOSITORY_NAME="ecs-codepipeline-practice/api"

# 1. AWS 계정 ID 가져오기
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
if [ $? -ne 0 ]; then
  echo "Error: AWS 계정 ID를 가져오는데 실패했습니다. AWS CLI가 올바르게 구성되어 있는지 확인하세요."
  exit 1
fi

# 2. ECR 리포지토리 URI 생성
ECR_REPOSITORY_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY_NAME}"

# 3. AWS ECR 로그인
echo "AWS ECR에 로그인 중..."
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

# 4. Docker 이미지 빌드
echo "Docker 이미지 빌드 중..."
docker build -t ${ECR_REPOSITORY_NAME}:latest -f apps/api/Dockerfile .

# 5. 이미지 태그 지정
echo "이미지 태그 지정 중..."
docker tag ${ECR_REPOSITORY_NAME}:latest ${ECR_REPOSITORY_URI}:latest

# 6. ECR에 이미지 푸시
echo "ECR에 이미지 푸시 중..."
docker push ${ECR_REPOSITORY_URI}:latest