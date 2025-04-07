#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkStack } from '../lib/cdk-stack';
import { CicdPipelineStack } from '../lib/cicd-pipeline-stack';

const app = new cdk.App();
const stack = new CdkStack(app, 'EcsWithCodePipelinePracticeStack', {});
new CicdPipelineStack(app, 'EcsWithCodePipelinePracticeCicdStack', {
  stack,
  githubOwner: 'boy672820',
  githubRepo: 'aws-ecs-with-codepipeline-practice',
  githubBranch: 'main',
  notificationEmail: 'boy672820@gmail.com',
});
