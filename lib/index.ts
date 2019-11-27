import * as AWS from "aws-sdk";
import * as fs from "fs";
import {
  CreateSecurityGroupRequest,
  AuthorizeSecurityGroupIngressRequest,
  RunInstancesRequest,
  DescribeInstancesRequest,
  ImportKeyPairRequest,
  Tag,
  CreateImageRequest,
  Instance,
  SecurityGroup
} from "aws-sdk/clients/ec2";
import {
  CreateLoadBalancerInput,
  CreateTargetGroupInput
} from "aws-sdk/clients/elbv2";
import ELBv2 = require("aws-sdk/clients/elbv2");
import {
  CreateAutoScalingGroupType,
  CreateLaunchConfigurationType,
  InstanceIds
} from "aws-sdk/clients/autoscaling";
import { AutoScalingGroupName } from "aws-sdk/clients/codedeploy";
import EC2 = require("aws-sdk/clients/ec2");
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* This example creates a key pair named my-key-pair. */
const keyMaterial = fs.readFileSync("./credentials/project.pub");
const tag: Tag = { Key: "Owner", Value: "jj" };

const keyPair: ImportKeyPairRequest = {
  KeyName: "Project",
  PublicKeyMaterial: keyMaterial
};
const securityGroupWebServerParams: CreateSecurityGroupRequest = {
  Description: "Security group for APS3 by JJ",
  GroupName: "Project-Webserver"
};
const privateGatewaySecGroupParams: CreateSecurityGroupRequest = {
  Description: "Security group for private cloud gateway by JJ",
  GroupName: "Project-Private-Cloud-Gateway"
};
const toOhioSecGroupParams: CreateSecurityGroupRequest = {
  Description:
    "Security group for communication between private and public Cloud gateway by JJ",
  GroupName: "Project-Public-Cloud-ToOhio"
};
const privateDbSecGroupParams: CreateSecurityGroupRequest = {
  Description: "Security group for private cloud Db by JJ",
  GroupName: "Project-Private-Cloud-Db"
};
const instanceParamsToOhio: RunInstancesRequest = {
  ImageId: "ami-04b9e92b5572fa0d1",
  InstanceType: "t2.micro",
  KeyName: keyPair.KeyName,
  MinCount: 1,
  MaxCount: 1,
  TagSpecifications: [
    {
      ResourceType: "instance",
      Tags: [
        {
          Key: "Owner",
          Value: "jj"
        }
      ]
    }
  ]
};
const ec2 = new AWS.EC2({ region: "us-east-1" });
const autoScaling = new AWS.AutoScaling({ region: "us-east-1" });
const elb = new AWS.ELBv2({ region: "us-east-1" });

const findWebServerInstancesIdByTag = async (tag: Tag, state: string[]) => {
  const a: DescribeInstancesRequest = {
    Filters: [
      { Name: `tag:${tag.Key}`, Values: [tag.Value] },
      { Name: "instance-state-name", Values: state }
    ]
  };

  const instances = await ec2.describeInstances(a).promise();
  let InstanceIds = [];
  if (instances.Reservations.length > 0) {
    for (let index = 0; index < instances.Reservations.length; index++) {
      InstanceIds.push(
        instances.Reservations[index].Instances.map(i => i.InstanceId)[0]
      );
    }
  }
  return InstanceIds;
};
const findWebServerInstancesIdByTagOhio = async (tag: Tag, state: string[]) => {
  const ec2 = new AWS.EC2({ region: "us-east-2" });

  const a: DescribeInstancesRequest = {
    Filters: [
      { Name: `tag:${tag.Key}`, Values: [tag.Value] },
      { Name: "instance-state-name", Values: state }
    ]
  };

  const instances = await ec2.describeInstances(a).promise();
  let InstanceIds = [];
  // console.log(instances.Reservations);
  if (instances.Reservations.length > 0) {
    for (let index = 0; index < instances.Reservations.length; index++) {
      InstanceIds.push(
        instances.Reservations[index].Instances.map(i => i.InstanceId)[0]
      );
    }
  }
  return InstanceIds;
};
const delInstances = async () => {
  try {
    const InstanceIds = await findWebServerInstancesIdByTag(tag, [
      "running",
      "stopped"
    ]);
    await ec2.terminateInstances({ InstanceIds }).promise();
    const terminated = await ec2
      .waitFor("instanceTerminated", { InstanceIds })
      .promise();
    return console.log("Instances Terminated", terminated);
  } catch (error) {
    console.log(
      "Error occured in finding and terminating running instances",
      error
    );
    return null;
  }
};
const delInstancesOhio = async () => {
  const ec2 = new AWS.EC2({ region: "us-east-2" });

  try {
    const InstanceIds = await findWebServerInstancesIdByTagOhio(tag, [
      "running",
      "stopped"
    ]);

    await ec2.terminateInstances({ InstanceIds }).promise();
    const terminated = await ec2
      .waitFor("instanceTerminated", { InstanceIds })
      .promise();
    return console.log("Instances Terminated", terminated);
  } catch (error) {
    console.log(
      "Error occured in finding and terminating running instances",
      error
    );
    return null;
  }
};
const importKeyPair = async (keyPair: ImportKeyPairRequest) => {
  try {
    const importKeyPair = await ec2.importKeyPair(keyPair).promise();
    console.log("Key Pair imported", importKeyPair.KeyName);
  } catch (error) {
    console.log("Error occured in importing Key Pair", error);
  }
  try {
    await ec2
      .waitFor("keyPairExists", { KeyNames: [keyPair.KeyName] })
      .promise();
    console.log("Key Pair exists", keyPair.KeyName);
  } catch (error) {
    console.log("Error occured in waiting for Key Pair Exists", error);
  }
};
const importKeyPairOhio = async (keyPair: ImportKeyPairRequest) => {
  const ec2 = new AWS.EC2({ region: "us-east-2" });

  try {
    const importKeyPair = await ec2.importKeyPair(keyPair).promise();
    console.log("Key Pair imported", importKeyPair.KeyName);
  } catch (error) {
    console.log("Error occured in importing Key Pair", error);
  }
  try {
    await ec2
      .waitFor("keyPairExists", { KeyNames: [keyPair.KeyName] })
      .promise();
    console.log("Key Pair exists", keyPair.KeyName);
  } catch (error) {
    console.log("Error occured in waiting for Key Pair Exists", error);
  }
};

const configureInstance = async (toOhioIp: string) => {
  await importKeyPair(keyPair);
  const scGroupReq: AuthorizeSecurityGroupIngressRequest = {
    GroupName: securityGroupWebServerParams.GroupName,
    IpPermissions: [
      {
        FromPort: 8000,
        IpProtocol: "tcp",
        ToPort: 8000,
        IpRanges: [
          {
            CidrIp: "0.0.0.0/0",
            Description: "FastAPI port open"
          }
        ],
        Ipv6Ranges: [
          {
            CidrIpv6: "::/0",
            Description: "HTTP access from everywhere"
          }
        ]
      }
    ]
  };

  await createSecurityGroup(securityGroupWebServerParams, scGroupReq);

  const userData = `#!/bin/bash
  cd home/ubuntu
  sudo apt-get update
  sudo apt-get -y install python3
  sudo apt-get -y install python3-pip
  git clone https://github.com/juanjorgegarcia/cloud-APS1
  cd cloud-APS1
  chmod +x ./setup.sh
  ./setup.sh
  chmod +x ./runserver.sh
  echo ${toOhioIp} > ./env
  sudo touch /etc/rc.local
  sudo bash -c 'echo  "#!/bin/sh -e
  #
  # rc.local
  #
  # This script is executed at the end of each multiuser runlevel.
  # Make sure that the script will "exit 0" on success or any other
  # value on error.
  #
  # In order to enable or disable this script just change the execution
  # bits.
  #
  # By default this script does nothing.
  sh '/home/ubuntu/cloud-APS1/runserver.sh'
  exit 0" >> /etc/rc.local
   '
  sudo chown root /etc/rc.local
  sudo chmod 755 /etc/rc.local
  uvicorn redirect:app --host 0.0.0.0 --port 8000
  `;

  const instanceParams: RunInstancesRequest = {
    ImageId: "ami-04b9e92b5572fa0d1",
    InstanceType: "t2.micro",
    KeyName: keyPair.KeyName,
    MinCount: 1,
    MaxCount: 1,
    UserData: Buffer.from(userData).toString("base64"),
    SecurityGroups: [securityGroupWebServerParams.GroupName],
    TagSpecifications: [
      {
        ResourceType: "instance",
        Tags: [
          {
            Key: "Owner",
            Value: "jj"
          }
        ]
      }
    ]
  };
  const inst = await ec2.runInstances(instanceParams).promise();
  return { Instance: inst.Instances[0], KeyName: keyPair.KeyName };
};
const deleteSecurityGroup = async (
  securityGroupParams: CreateSecurityGroupRequest
) => {
  try {
    const securityGroups = await ec2
      .describeSecurityGroups({ GroupNames: [securityGroupParams.GroupName] })
      .promise();
    if (securityGroups.SecurityGroups.length > 0) {
      await ec2
        .deleteSecurityGroup({
          GroupName: securityGroupParams.GroupName
        })
        .promise();
      console.log("Security Group Deleted", securityGroupParams.GroupName);
    }
  } catch (error) {
    console.log(
      `Error occured in Deleting SecurityGroup ${securityGroupParams.GroupName}`,
      error
    );
  }
};
const createSecurityGroup = async (
  securityGroupParams: CreateSecurityGroupRequest,
  scGroupReq: AuthorizeSecurityGroupIngressRequest
) => {
  try {
    const scGroup = await ec2
      .createSecurityGroup(securityGroupParams)
      .promise();
    const { GroupId } = scGroup;
    await ec2
      .authorizeSecurityGroupIngress({ ...scGroupReq, GroupId })
      .promise();
    console.log("Security Group Created", securityGroupParams.GroupName);
    return scGroup;
  } catch (error) {
    console.log(
      `Error occured in Creating SecurityGroup ${securityGroupParams.GroupName}`,
      error
    );
  }
};

const deleteSecurityGroupOhio = async (
  securityGroupParams: CreateSecurityGroupRequest
) => {
  const ec2 = new AWS.EC2({ region: "us-east-2" });

  try {
    const securityGroups = await ec2
      .describeSecurityGroups({ GroupNames: [securityGroupParams.GroupName] })
      .promise();
    if (securityGroups.SecurityGroups.length > 0) {
      await ec2
        .deleteSecurityGroup({
          GroupName: securityGroupParams.GroupName
        })
        .promise();
      console.log("Security Group Deleted", securityGroupParams.GroupName);
    }
  } catch (error) {
    console.log(
      `Error occured in Deleting SecurityGroup ${securityGroupParams.GroupName}`,
      error
    );
  }
};
const createSecurityGroupOhio = async (
  securityGroupParams: CreateSecurityGroupRequest,
  scGroupReq?: AuthorizeSecurityGroupIngressRequest
) => {
  const ec2 = new AWS.EC2({ region: "us-east-2" });
  try {
    const scGroup = await ec2
      .createSecurityGroup(securityGroupParams)
      .promise();
    if (scGroupReq) {
      await ec2
        .authorizeSecurityGroupIngress({
          ...scGroupReq,
          GroupId: scGroup.GroupId
        })
        .promise();
      console.log(
        "Security Group Rules Created",
        securityGroupParams.GroupName
      );
    }
    console.log("Security Group Created", securityGroupParams.GroupName);
    return scGroup;
  } catch (error) {
    console.log(
      `Error occured in Creating SecurityGroup ${securityGroupParams.GroupName}`,
      error
    );
  }
};
const deleteLoadBalancer = async (loadBalancerName: string) => {
  try {
    const { LoadBalancers } = await elb
      .describeLoadBalancers({
        Names: [loadBalancerName]
      })
      .promise();
    if (LoadBalancers && LoadBalancers.length > 0) {
      await elb
        .deleteLoadBalancer({
          LoadBalancerArn: LoadBalancers[0].LoadBalancerArn
        })
        .promise();
      const lb = await elb
        .waitFor("loadBalancersDeleted", {
          LoadBalancerArns: [LoadBalancers[0].LoadBalancerArn]
        })
        .promise();
      await sleep(1000 * 60);
      if (lb.LoadBalancers && lb.LoadBalancers.length > 0) {
        console.log(
          "Load Balancer Deleted",
          lb.LoadBalancers[0].LoadBalancerName
        );
      }
    }
  } catch (error) {
    console.log("Error occured in Deleting LoadBalancer", error);
  }
};

const createLoadBalancer = async (
  setupLoadBalancerParams: CreateLoadBalancerInput
) => {
  try {
    const { LoadBalancers } = await elb
      .createLoadBalancer(setupLoadBalancerParams)
      .promise();

    const lbs = await elb
      .waitFor("loadBalancerAvailable", {
        Names: [setupLoadBalancerParams.Name]
      })
      .promise();
    if (lbs.LoadBalancers && lbs.LoadBalancers.length > 0) {
      console.log(
        "LoadBalancer created",
        lbs.LoadBalancers[0].LoadBalancerName
      );
    }
    await sleep(1000 * 60);
    console.log("LoadBalancer Created", lbs.LoadBalancers[0].LoadBalancerName);

    return LoadBalancers[0];
  } catch (error) {
    console.log("Error occured in Creating LoadBalancer", error);
  }
  return null;
};

const deleteImage = async (imageName: CreateImageRequest["Name"]) => {
  try {
    const images = await ec2
      .describeImages({
        Filters: [{ Name: "name", Values: [imageName] }]
      })
      .promise();
    if (images.Images && images.Images.length > 0) {
      const a = await ec2
        .deregisterImage({ ImageId: images.Images[0].ImageId })
        .promise();
      console.log("Image deregistered", imageName);
    }
  } catch (error) {
    console.log("Error occured in Deregister Image", error);
  }
};
const createImage = async (
  createImageParams: CreateImageRequest,
  InstanceIdList: Instance["InstanceId"][]
) => {
  try {
    await ec2
      .waitFor("instanceStatusOk", {
        InstanceIds: InstanceIdList
      })
      .promise();
  } catch (error) {
    console.log("Error occured in waiting for statusOk", error);
  }

  try {
    const image = await ec2.createImage(createImageParams).promise();
    console.log("Instance image created", image.ImageId);
    const imgs = await ec2
      .waitFor("imageAvailable", { ImageIds: [image.ImageId] })
      .promise();
    if (imgs.Images && imgs.Images.length > 0) {
      return imgs.Images[0];
    }
    console.log("Instance image available", imgs.Images[0].Name);
  } catch (error) {
    console.log("Error occured in Creating Image", error);
  }
};
const deleteKeyPairOhio = async (keyPair: EC2.DeleteKeyPairRequest) => {
  const ec2 = new AWS.EC2({ region: "us-east-2" });
  try {
    const deleteKeyPair = await ec2
      .deleteKeyPair({ KeyName: keyPair.KeyName })
      .promise();
    console.log("Key Pair delete", keyPair.KeyName);
  } catch (error) {
    console.log("Error occured in deleting Key Pair", error);
  }
};
const deleteTargetGroup = async targetGroupName => {
  try {
    const targetGroups: ELBv2.Types.DescribeTargetGroupsOutput = await elb
      .describeTargetGroups({
        Names: [targetGroupName]
      })
      .promise();
    if (targetGroups.TargetGroups && targetGroups.TargetGroups.length > 0) {
      await elb
        .deleteTargetGroup({
          TargetGroupArn: targetGroups.TargetGroups[0].TargetGroupArn
        })
        .promise();
      console.log("Target Group Deleted", targetGroupName);
    }
  } catch (error) {
    console.log("Error occured in Deleting TargetGroup", error);
  }
};
const createTargetGroup = async (targetGroupParams: CreateTargetGroupInput) => {
  try {
    const { TargetGroups } = await elb
      .createTargetGroup(targetGroupParams)
      .promise();
    const targetGroup: ELBv2.TargetGroup = TargetGroups[0];
    return targetGroup;
  } catch (error) {
    console.log("Error occured in Creating TargetGroup", error);
  }
};

const deleteListener = async LoadBalancerName => {
  try {
    const { LoadBalancers } = await elb
      .describeLoadBalancers({
        Names: [LoadBalancerName]
      })
      .promise();

    const { Listeners }: ELBv2.CreateListenerOutput = await elb
      .describeListeners({
        LoadBalancerArn: LoadBalancers[0].LoadBalancerArn
      })
      .promise();
    console.log(Listeners);
    await elb
      .deleteListener({ ListenerArn: Listeners[0].ListenerArn })
      .promise();

    console.log("Listener Deleted", Listeners[0]);
  } catch (error) {
    console.log("error Deleting listener", error);
  }
};

const createListener = async (
  createListenerParams: ELBv2.CreateListenerInput
) => {
  try {
    const listeners = await elb.createListener(createListenerParams).promise();
    console.log("Listener Created", listeners.Listeners[0]);
  } catch (error) {
    console.log("error creating listener", error);
  }
};
const deleteLaunchConfiguration = async LaunchConfigurationName => {
  try {
    const a = await autoScaling
      .deleteLaunchConfiguration({ LaunchConfigurationName })
      .promise();
    console.log(a);
  } catch (error) {
    console.log("Error Deleting on LaunchConfiguration", error);
  }
};
const createLaunchConfiguration = async (
  createLaunchConfigurationParams: CreateLaunchConfigurationType
) => {
  try {
    const a = await autoScaling
      .createLaunchConfiguration(createLaunchConfigurationParams)
      .promise();
    console.log(a);
  } catch (error) {
    console.log("Error Creating on LaunchConfiguration", error);
  }
};

const deleteAutoScalingGroup = async (
  AutoScalingGroupName: AutoScalingGroupName
) => {
  try {
    await autoScaling
      .deleteAutoScalingGroup({ AutoScalingGroupName, ForceDelete: true })
      .promise();
    await sleep(1000 * 60);
  } catch (error) {
    console.log("Error Delete on AutoScaling", error);
  }
};
const createAutoScalingGroup = async (
  createAutoScalingParams: CreateAutoScalingGroupType
) => {
  try {
    await autoScaling.createAutoScalingGroup(createAutoScalingParams).promise();
  } catch (error) {
    console.log("Error Creating on AutoScaling", error);
  }
};
const registerTargets = async (
  TargetGroupArn: ELBv2.TargetGroupArn,
  InstanceId: Instance["InstanceId"]
) => {
  try {
    await elb
      .registerTargets({
        TargetGroupArn,
        Targets: [{ Id: InstanceId, Port: 8000 }]
      })
      .promise();
  } catch (error) {
    console.log("Error Registering Targers ", error);
  }
};
const allocateAndAssociateElasticIp = async (
  InstanceId: Instance["InstanceId"]
) => {
  try {
    const { PublicIp } = await ec2.allocateAddress().promise();
    console.log("AllocatingElasticIp success", PublicIp);

    await ec2.associateAddress({ InstanceId, PublicIp }).promise();
    console.log("AssociatingElasticIp success", PublicIp);
  } catch (error) {
    console.log("Error AllocatingElasticIp ", error);
  }
};
const createInstance = async (instanceParams: RunInstancesRequest) => {
  try {
    const inst = await ec2.runInstances(instanceParams).promise();
    console.log("Instance created", inst.Instances[0].PrivateDnsName);
    return inst;
  } catch (error) {
    console.log("Error Creating Instance", error);
  }
};
const createInstanceOhio = async (instanceParams: RunInstancesRequest) => {
  const ec2 = new AWS.EC2({ region: "us-east-2" });
  try {
    const inst = await ec2.runInstances(instanceParams).promise();
    console.log("Instance pending", inst.Instances[0].PrivateDnsName);

    const privateDb = inst.Instances[0];
    try {
      await ec2
        .waitFor("instanceStatusOk", {
          InstanceIds: [privateDb.InstanceId]
        })
        .promise();
      console.log("Instance created", inst.Instances[0].PrivateDnsName);
    } catch (error) {
      console.log("Error occured in waiting for statusOk", error);
    }
    return inst.Instances[0];
  } catch (error) {
    console.log("Error Creating Instance", error);
  }
};
const createSecGroupRules = async (
  GroupId: SecurityGroup["GroupId"],
  scGroupReq: AuthorizeSecurityGroupIngressRequest
) => {
  const ec2 = new AWS.EC2({ region: "us-east-2" });
  try {
    await ec2
      .authorizeSecurityGroupIngress({ ...scGroupReq, GroupId })
      .promise();
    console.log("Security Group Rules Created", scGroupReq);
  } catch (error) {
    console.log(
      `Error occured in Creating SecurityGroup Rules ${scGroupReq}`,
      error
    );
  }
};

const revokeSecGroupRules = async (
  GroupId: SecurityGroup["GroupId"],
  scGroupReq: EC2.Types.RevokeSecurityGroupIngressRequest
) => {
  const ec2 = new AWS.EC2({ region: "us-east-2" });
  try {
    await ec2.revokeSecurityGroupIngress({ ...scGroupReq, GroupId }).promise();
    console.log("Security Group Rules Created", scGroupReq);
  } catch (error) {
    console.log(
      `Error occured in Creating SecurityGroup Rules ${scGroupReq}`,
      error
    );
  }
};
const releaseElasticIp = async () => {
  try {
    const { Addresses } = await ec2.describeAddresses().promise();
    console.log(Addresses);

    const inst = await ec2
      .releaseAddress({
        AllocationId: Addresses[0].AllocationId
      })
      .promise();
    console.log("Address Released", Addresses[0]);
  } catch (error) {
    console.log("Error Releasing PublicIp", error);
  }
};
const getPublicIp = async (InstanceIds: InstanceIds, Ohio: boolean) => {
  const a: DescribeInstancesRequest = {
    InstanceIds
  };

  try {
    const ec2 = Ohio
      ? new AWS.EC2({ region: "us-east-2" })
      : new AWS.EC2({ region: "us-east-1" });

    const { Reservations } = await ec2.describeInstances(a).promise();

    console.log("PublicIp", Reservations[0].Instances[0].PublicIpAddress);
    return Reservations[0].Instances[0].PublicIpAddress;
  } catch (error) {
    console.log("Error Getting PublicIp", error);
  }
  // console.log(instances.Reservations);
  return null;
};
const setupToOhio = async (
  securityGroupParams: CreateSecurityGroupRequest,
  scGroupReq: AuthorizeSecurityGroupIngressRequest,
  instanceParams: RunInstancesRequest
) => {
  const scGroup = await createSecurityGroup(securityGroupParams, scGroupReq);
  const inst = await createInstance({
    ...instanceParams,
    SecurityGroupIds: [scGroup ? scGroup.GroupId : null]
  });
  const privateDb = inst ? inst.Instances[0] : null;

  try {
    await ec2
      .waitFor("instanceStatusOk", {
        InstanceIds: [privateDb.InstanceId]
      })
      .promise();
  } catch (error) {
    console.log("Error occured in waiting for statusOk", error);
  }
  return {
    Instance: privateDb
  };
};
const scaling = async () => {
  await ec2.deleteKeyPair({ KeyName: keyPair.KeyName }).promise();
  await delInstancesOhio();

  await delInstances();

  const loadBalancerName = "Project-Webserver-LoadBalancer";
  const targetGroupName = "Project-Webservers-TargetGroup";
  const AutoScalingGroupName = "Project-Webserver-AutoScaling";
  const LaunchConfigurationName = "Project-Webserver-LaunchConfiguration";
  const ImageName = "Project-Webserver-Image";

  const securityGroupParams: CreateSecurityGroupRequest = {
    Description: "Security group for LoadBalancer by JJ",
    GroupName: "Project-LoadBalancer-SecurityGroup"
  };

  await deleteImage(ImageName);
  await deleteListener(loadBalancerName);
  await deleteAutoScalingGroup(AutoScalingGroupName);
  await deleteTargetGroup(targetGroupName);
  await deleteLoadBalancer(loadBalancerName);
  await deleteLaunchConfiguration(LaunchConfigurationName);
  await deleteKeyPairOhio(keyPair);
  await deleteSecurityGroup(securityGroupParams);
  await deleteSecurityGroup(toOhioSecGroupParams);
  await deleteSecurityGroup(securityGroupWebServerParams);
  await deleteSecurityGroupOhio(privateGatewaySecGroupParams);
  await deleteSecurityGroupOhio(privateDbSecGroupParams);

  await importKeyPair(keyPair);
  await importKeyPairOhio(keyPair);

  const userDataPrivatedDb = fs.readFileSync("./lib/setupDB.sh");

  const userDataPrivatedDbEncoded = userDataPrivatedDb.toString("base64");

  const instanceParamsPrivate: RunInstancesRequest = {
    ImageId: "ami-0d5d9d301c853a04a",
    InstanceType: "t2.micro",
    KeyName: keyPair.KeyName,
    MinCount: 1,
    MaxCount: 1,
    TagSpecifications: [
      {
        ResourceType: "instance",
        Tags: [
          {
            Key: "Owner",
            Value: "jj"
          }
        ]
      }
    ]
  };
  const openUntilGatewayOpenRule = {
    GroupName: privateDbSecGroupParams.GroupName,
    IpPermissions: [
      {
        FromPort: 27017,
        IpProtocol: "tcp",
        ToPort: 27017,
        IpRanges: [
          {
            CidrIp: "0.0.0.0/0",
            Description:
              "Mongo port access by private IP to private cloud Gateway"
          }
        ]
      }
    ]
  };
  const privateDbSecGroup = await createSecurityGroupOhio(
    privateDbSecGroupParams,
    openUntilGatewayOpenRule
  );

  const privateDb = await createInstanceOhio({
    ...instanceParamsPrivate,
    UserData: userDataPrivatedDbEncoded,
    SecurityGroupIds: [privateDbSecGroup.GroupId]
  });
  console.log("Private Ip do Db", privateDb.PrivateIpAddress);

  const privateSetupEnv = `#!/bin/bash
  cd home/ubuntu
  sudo apt-get update
  git clone https://github.com/juanjorgegarcia/privateCloudServer
  cd privateCloudServer/
  chmod +x ./runserver.sh
  chmod +x ./setup.sh
  ./setup.sh
  cd lib
  touch ./env.ts
  echo '//@ts-ignore\nexport const IP = "${privateDb.PrivateIpAddress}";' >> ./env.ts
  sudo touch /etc/rc.local
  sudo bash -c 'echo  "#!/bin/sh -e
  #
  # rc.local
  #
  # This script is executed at the end of each multiuser runlevel.
  # Make sure that the script will "exit 0" on success or any other
  # value on error.
  #
  # In order to enable or disable this script just change the execution
  # bits.
  #
  # By default this script does nothing.
  sh '/home/ubuntu/privateCloudServer/runserver.sh'
  exit 0" >> /etc/rc.local
   '
  sudo chown root /etc/rc.local
  sudo chmod 755 /etc/rc.local
  cd /home/ubuntu/privateCloudServer && sudo npm run prod
  `;
  const scGroupPrivateGateway = await createSecurityGroupOhio(
    privateGatewaySecGroupParams
  );

  const privateGateway = await createInstanceOhio({
    ...instanceParamsPrivate,
    UserData: Buffer.from(privateSetupEnv).toString("base64"),
    SubnetId: privateDb.SubnetId,
    SecurityGroupIds: [scGroupPrivateGateway.GroupId]
  });
  const PublicIpAddress = await getPublicIp([privateGateway.InstanceId], true);

  const privateDbScReq: AuthorizeSecurityGroupIngressRequest = {
    GroupName: privateDbSecGroupParams.GroupName,
    IpPermissions: [
      {
        FromPort: 27017,
        IpProtocol: "tcp",
        ToPort: 27017,
        IpRanges: [
          {
            CidrIp: `${privateGateway.PrivateIpAddress}/32`,
            Description:
              "Mongo port access by private IP to private cloud Gateway"
          }
        ]
      }
    ]
  };
  await revokeSecGroupRules(
    scGroupPrivateGateway.GroupId,
    openUntilGatewayOpenRule
  );
  await createSecGroupRules(scGroupPrivateGateway.GroupId, privateDbScReq);

  console.log("PublicAddress", PublicIpAddress);
  const userDataToOhio = `#!/bin/bash
  cd home/ubuntu
  sudo apt-get update
  sudo apt-get -y install python3
  sudo apt-get -y install python3-pip
  git clone https://github.com/juanjorgegarcia/cloud-APS1
  cd cloud-APS1
  chmod +x ./setup.sh
  ./setup.sh
  chmod +x ./runredirect.sh
  echo ${PublicIpAddress} > ./env
  sudo touch /etc/rc.local
  sudo bash -c 'echo  "#!/bin/sh -e
  #
  # rc.local
  #
  # This script is executed at the end of each multiuser runlevel.
  # Make sure that the script will "exit 0" on success or any other
  # value on error.
  #
  # In order to enable or disable this script just change the execution
  # bits.
  #
  # By default this script does nothing.
  sh '/home/ubuntu/cloud-APS1/runredirect.sh'
  exit 0" >> /etc/rc.local
   '
  sudo chown root /etc/rc.local
  sudo chmod 755 /etc/rc.local
  uvicorn redirect:app --host 0.0.0.0 --port 8000
  `;

  const toOhioScReq: AuthorizeSecurityGroupIngressRequest = {
    GroupName: toOhioSecGroupParams.GroupName,
    IpPermissions: [
      {
        FromPort: 8000,
        IpProtocol: "tcp",
        ToPort: 8000,
        IpRanges: [
          {
            CidrIp: "172.0.0.0/8",
            Description: "Access 8000 from amazon"
          }
        ]
      }
    ]
  };
  const toOhio = await setupToOhio(toOhioSecGroupParams, toOhioScReq, {
    ...instanceParamsToOhio,
    UserData: Buffer.from(userDataToOhio).toString("base64")
  });
  console.log("Private Ip do toOhio", toOhio.Instance.PrivateIpAddress);
  const toOhioPublicIP = await getPublicIp([toOhio.Instance.InstanceId], false);

  const privateGatewayScReq: AuthorizeSecurityGroupIngressRequest = {
    GroupName: privateGatewaySecGroupParams.GroupName,
    IpPermissions: [
      {
        FromPort: 22,
        IpProtocol: "tcp",
        ToPort: 22,
        IpRanges: [
          {
            CidrIp: "0.0.0.0/0",
            Description: "SSH access from everywhere"
          }
        ],
        Ipv6Ranges: [
          {
            CidrIpv6: "::/0",
            Description: "HTTP access from everywhere"
          }
        ]
      },
      {
        FromPort: 3000,
        IpProtocol: "tcp",
        ToPort: 3000,
        IpRanges: [
          {
            CidrIp: `${toOhioPublicIP}/32`,
            Description: "Node server port open to autoscaling gateway"
          }
        ]
      }
    ]
  };
  await createSecGroupRules(scGroupPrivateGateway.GroupId, privateGatewayScReq);
  const { Instance, KeyName } = await configureInstance(
    toOhio.Instance.PrivateIpAddress
  );
  const { InstanceId, SecurityGroups } = Instance;

  const createImageParams: CreateImageRequest = {
    Description: "Image of the Webserver instance by JJ",
    Name: ImageName,
    InstanceId
  };
  const img = await createImage(createImageParams, [InstanceId]);

  const scGroupReq: AuthorizeSecurityGroupIngressRequest = {
    GroupName: securityGroupParams.GroupName,
    IpPermissions: [
      {
        FromPort: 80,
        IpProtocol: "tcp",
        ToPort: 80,
        IpRanges: [
          {
            CidrIp: "0.0.0.0/0",
            Description: "HTTP access from everywhere"
          }
        ],
        Ipv6Ranges: [
          {
            CidrIpv6: "::/0",
            Description: "HTTP access from everywhere"
          }
        ]
      }
    ]
  };
  const scGroup = await createSecurityGroup(securityGroupParams, scGroupReq);

  const loadBalancerParams: CreateLoadBalancerInput = {
    Name: loadBalancerName,
    Scheme: "internet-facing",
    Tags: [tag as AWS.ELBv2.Tag],
    IpAddressType: "ipv4",
    Type: "application",
    Subnets: [
      "subnet-13fa4b4f",
      "subnet-4d2f5a42",
      "subnet-51976d6f",
      "subnet-54296d1e",
      "subnet-7ebe0d50",
      "subnet-e0f44387"
    ],
    SecurityGroups: [scGroup.GroupId]
  };
  const loadBalancer = await createLoadBalancer(loadBalancerParams);
  console.log(loadBalancer);

  const { ImageId } = img;
  const targetGroupParams: CreateTargetGroupInput = {
    Name: targetGroupName,
    Protocol: "HTTP",
    TargetType: "instance",
    Port: 8000,
    VpcId: loadBalancer.VpcId
  };
  const targetGroup: ELBv2.TargetGroup = await createTargetGroup(
    targetGroupParams
  );
  const { TargetGroupArn } = targetGroup;

  await registerTargets(TargetGroupArn, InstanceId);
  console.log(targetGroup);
  const createListenerParams: ELBv2.CreateListenerInput = {
    LoadBalancerArn: loadBalancer.LoadBalancerArn,
    Protocol: "HTTP",
    Port: 80,
    DefaultActions: [
      {
        Type: "forward",
        TargetGroupArn: targetGroup.TargetGroupArn
      }
    ]
  };
  await createListener(createListenerParams);
  const createLaunchConfigurationParams: CreateLaunchConfigurationType = {
    LaunchConfigurationName,
    ImageId,
    KeyName,
    SecurityGroups: SecurityGroups.map(i => i.GroupId),
    InstanceType: "t2.micro"
  };
  await createLaunchConfiguration(createLaunchConfigurationParams);

  const createAutoScalingParams: CreateAutoScalingGroupType = {
    AutoScalingGroupName,
    Tags: [tag as AWS.AutoScaling.Tag],
    LaunchConfigurationName,
    MinSize: 1,
    MaxSize: 5,
    TargetGroupARNs: [targetGroup.TargetGroupArn],
    AvailabilityZones: [
      "us-east-1a",
      "us-east-1b",
      "us-east-1c",
      "us-east-1d",
      "us-east-1e",
      "us-east-1f"
    ]
  };
  await createAutoScalingGroup(createAutoScalingParams);
  await ec2.terminateInstances({ InstanceIds: [InstanceId] }).promise();
  await ec2
    .waitFor("instanceTerminated", { InstanceIds: [InstanceId] })
    .promise();
  await sleep(1000 * 60);
};
scaling();
