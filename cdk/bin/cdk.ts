#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkStack } from '../lib/cdk-stack';
import { CicdPipelineStack } from '../lib/cicd-pipeline-stack';

const app = new cdk.App();
const stack = new CdkStack(app, 'EcsCodePipelinePracticeStack', {});
new CicdPipelineStack(app, 'EcsCodePipelinePracticeCicdStack', {
  stack,
  githubOwner: 'github-owner-name',
  githubRepo: 'your-github-repository-name',
  githubBranch: 'main',
  notificationEmail: 'your-email@gmail.com',
});

// 예를 들어:
// 주소가 "https://github.com/boy672820/aws-ecs-codepipeline-practice"인 저장소라면 다음과 같이 설정할 수 있습니다.
//
// new CicdPipelineStack(app, 'EcsCodePipelinePracticeCicdStack', {
//   stack,
//   githubOwner: 'boy672820',
//   githubRepo: 'aws-ecs-codepipeline-practice',
//   githubBranch: 'main',
//   notificationEmail: 'your-email@gmail.com',
// });
