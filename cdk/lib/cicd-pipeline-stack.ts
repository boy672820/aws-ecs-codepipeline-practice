import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { CdkStack } from './cdk-stack';

export interface CicdPipelineStackProps extends cdk.StackProps {
  /**
   * 인프라 스택 참조
   */
  stack: CdkStack;

  /**
   * GitHub 저장소 소유자
   */
  githubOwner: string;

  /**
   * GitHub 저장소 이름
   */
  githubRepo: string;

  /**
   * GitHub 브랜치 이름
   */
  githubBranch: string;

  /**
   * 알림을 받을 이메일 주소 (선택 사항)
   */
  notificationEmail?: string;
}

export class CicdPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CicdPipelineStackProps) {
    super(scope, id, props);

    // SNS 주제 생성 (알림용)
    const pipelineNotificationTopic = new sns.Topic(
      this,
      'PipelineNotificationTopic',
      {
        displayName: 'Pipeline Notification Topic',
      },
    );

    // 이메일 구독 추가 (선택 사항)
    if (props.notificationEmail) {
      pipelineNotificationTopic.addSubscription(
        new subscriptions.EmailSubscription(props.notificationEmail),
      );
    }

    // 파이프라인 아티팩트
    const sourceOutput = new codepipeline.Artifact();
    const buildOutput = new codepipeline.Artifact();

    // CodeBuild 프로젝트
    const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
      projectName: 'ecs-codepipeline-practice-api-build',
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: true, // Docker 빌드를 위해 필요
      },
      environmentVariables: {
        AWS_DEFAULT_REGION: { value: this.region },
        AWS_ACCOUNT_ID: { value: this.account },
        ECR_REPOSITORY_NAME: {
          value: props.stack.ecrRepository.repositoryName,
        },
        ECS_CLUSTER_NAME: { value: props.stack.ecsCluster.clusterName },
        ECS_SERVICE_NAME: { value: props.stack.ecsService.serviceName },
        CONTAINER_NAME: { value: props.stack.containerName },
      },
      timeout: cdk.Duration.minutes(30),
    });

    // CodeBuild 프로젝트에 ECR 권한 부여
    buildProject.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ecr:GetAuthorizationToken',
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:GetRepositoryPolicy',
          'ecr:DescribeRepositories',
          'ecr:ListImages',
          'ecr:DescribeImages',
          'ecr:BatchGetImage',
          'ecr:InitiateLayerUpload',
          'ecr:UploadLayerPart',
          'ecr:CompleteLayerUpload',
          'ecr:PutImage',
        ],
        resources: ['*'],
      }),
    );

    // ECS 배포 권한 부여
    buildProject.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ecs:DescribeTaskDefinition',
          'ecs:RegisterTaskDefinition',
          'ecs:UpdateService',
          'ecs:DescribeServices',
        ],
        resources: ['*'],
      }),
    );

    // IAM 역할 권한 부여
    buildProject.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['iam:PassRole'],
        resources: ['*'],
        conditions: {
          StringEqualsIfExists: {
            'iam:PassedToService': ['ecs-tasks.amazonaws.com'],
          },
        },
      }),
    );

    // CodePipeline 생성
    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: 'ecs-codepipeline-practice-api-pipeline',
      restartExecutionOnUpdate: true,
    });

    // 소스 단계
    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.GitHubSourceAction({
          actionName: 'GitHub_Source',
          owner: props.githubOwner,
          repo: props.githubRepo,
          branch: props.githubBranch,
          oauthToken: cdk.SecretValue.secretsManager(
            'dev/ecs-codepipeline-practice/github-token-v2',
          ),
          output: sourceOutput,
          trigger: codepipeline_actions.GitHubTrigger.WEBHOOK,
        }),
      ],
    });

    // 빌드 및 테스트 단계
    pipeline.addStage({
      stageName: 'Build_and_Test',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Build_and_Test',
          project: buildProject,
          input: sourceOutput,
          outputs: [buildOutput],
          executeBatchBuild: false,
        }),
      ],
    });

    // 배포 단계
    pipeline.addStage({
      stageName: 'Deploy',
      actions: [
        new codepipeline_actions.EcsDeployAction({
          actionName: 'Deploy_to_ECS',
          service: props.stack.ecsService,
          imageFile: buildOutput.atPath('imageDefinitions.json'),
        }),
      ],
    });

    // 파이프라인 실패 알림
    const pipelineFailedAlarm = new cloudwatch.Alarm(
      this,
      'PipelineFailedAlarm',
      {
        alarmName: 'EcsCodePipelinePracticeApiPipelineFailed',
        metric: new cloudwatch.Metric({
          namespace: 'AWS/CodePipeline',
          metricName: 'FailedPipeline',
          dimensionsMap: {
            PipelineName: pipeline.pipelineName,
          },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      },
    );

    pipelineFailedAlarm.addAlarmAction(
      new cloudwatch_actions.SnsAction(pipelineNotificationTopic),
    );

    // 출력
    new cdk.CfnOutput(this, 'PipelineName', {
      value: pipeline.pipelineName,
      description: 'CodePipeline 이름',
      exportName: 'ApiPipelineName',
    });

    new cdk.CfnOutput(this, 'NotificationTopicArn', {
      value: pipelineNotificationTopic.topicArn,
      description: '알림 SNS 주제 ARN',
      exportName: 'ApiPipelineNotificationTopicArn',
    });
  }
}
