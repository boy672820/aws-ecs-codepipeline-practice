import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';

export class CdkStack extends cdk.Stack {
  // 다른 스택에서 참조할 수 있도록 리소스를 public으로 내보냅니다
  public readonly vpc: ec2.Vpc;
  public readonly ecsCluster: ecs.Cluster;
  public readonly ecsService: ecs.FargateService;
  public readonly ecrRepository: ecr.IRepository;
  public readonly containerName: string;
  public readonly taskDefinition: ecs.FargateTaskDefinition;
  public readonly alb: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. VPC 설정 - 기본 VPC 사용
    this.vpc = new ec2.Vpc(this, 'EcsCodePipelinePracticeVpc', {
      maxAzs: 2,
    });

    // 보안 그룹 생성
    const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for ALB',
      allowAllOutbound: true,
    });
    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP traffic from anywhere',
    );

    const serviceSecurityGroup = new ec2.SecurityGroup(
      this,
      'ServiceSecurityGroup',
      {
        vpc: this.vpc,
        description: 'Security group for ECS service',
        allowAllOutbound: true,
      },
    );
    serviceSecurityGroup.addIngressRule(
      ec2.Peer.securityGroupId(albSecurityGroup.securityGroupId),
      ec2.Port.tcp(3000),
      'Allow traffic from ALB on container port',
    );

    // 2. ECR 리포지토리 지정
    this.ecrRepository = ecr.Repository.fromRepositoryName(
      this,
      'ApiRepository',
      'ecs-codepipeline-practice/api',
    );

    // 3. ECS 클러스터 생성
    this.ecsCluster = new ecs.Cluster(this, 'ApiCluster', {
      vpc: this.vpc,
      clusterName: 'ecs-codepipeline-practice-cluster',
    });

    // ALB 생성
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'ApiALB', {
      vpc: this.vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
      loadBalancerName: 'ecs-codepipeline-practice-alb',
    });

    // 대상 그룹 생성
    const targetGroup = new elbv2.ApplicationTargetGroup(
      this,
      'ApiTargetGroup',
      {
        vpc: this.vpc,
        port: 3000,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targetType: elbv2.TargetType.IP,
        healthCheck: {
          path: '/health',
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(5),
        },
      },
    );

    // HTTP 리스너 생성
    this.alb.addListener('HttpListener', {
      port: 80,
      defaultAction: elbv2.ListenerAction.forward([targetGroup]),
    });

    // 4. 태스크 정의 생성
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'ApiTaskDef', {
      memoryLimitMiB: 512, // 0.5GB
      cpu: 256, // 0.25 vCPU
    });

    // 컨테이너 정의
    this.containerName = 'api-container';
    const container = this.taskDefinition.addContainer(this.containerName, {
      // ECR 리포지토리의 최신 이미지 사용
      // 실제 환경에서는 특정 태그를 사용하는 것이 좋습니다
      image: ecs.ContainerImage.fromEcrRepository(this.ecrRepository),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'ecs-codepipeline-practice',
      }),
      environment: {
        // 환경 변수 설정
        NODE_ENV: 'production',
      },
    });

    // 포트 매핑
    container.addPortMappings({
      containerPort: 3000, // NestJS 기본 포트
      hostPort: 3000,
      protocol: ecs.Protocol.TCP,
    });

    // 5. ECS 서비스 생성
    this.ecsService = new ecs.FargateService(this, 'ApiService', {
      cluster: this.ecsCluster,
      taskDefinition: this.taskDefinition,
      desiredCount: 1, // 초기 태스크 수
      serviceName: 'api-service',
      assignPublicIp: false, // 로드 밸런서 사용 시 false로 설정
      securityGroups: [serviceSecurityGroup], // 보안 그룹 추가
    });

    // 로드 밸런서 연결
    this.ecsService.attachToApplicationTargetGroup(targetGroup);

    // 출력
    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: this.ecrRepository.repositoryUri,
      description: 'ECR Repository URI',
      exportName: 'EcrRepositoryUri',
    });

    new cdk.CfnOutput(this, 'EcsClusterName', {
      value: this.ecsCluster.clusterName,
      description: 'ECS Cluster Name',
      exportName: 'EcsClusterName',
    });

    new cdk.CfnOutput(this, 'EcsServiceName', {
      value: this.ecsService.serviceName,
      description: 'ECS Service Name',
      exportName: 'EcsServiceName',
    });

    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: this.alb.loadBalancerDnsName,
      description: 'ALB DNS Name',
      exportName: 'AlbDnsName',
    });
  }
}
