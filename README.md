# cfn-look-up-ami-ids
Serverless packaged AWS Lambda blueprint to lookup AMI IDs by AMI Name

This blueprint mirrors the blueprint of the same name provide by AWS, with the
following enhancements:

- Removes the restriction on looking up only AMI IDs owned by Amazon
- Uses a new parameter, `AmiNameSearchString`, as the match pattern
against AMI Names. Previously, the pattern was hard-coded in the blueprint
- Uses a new parameter `TemplateAmiID` to pass a user-defined 'static' AMI ID
to the function
- Uses a new parameter `AutoUpdateAmi` to enable use of the most recent AMI ID
on stack update.
- Improves error logging when the pattern does not match any images


## Lambda Execution Role

**Note:** When deploying this function as a serverless project the associated
IAM role is created automatically. The following instructions are included
purely for reference

Before creating the Lambda function, first create an IAM role with the
following policy to use with this blueprint. For convenience, name the role
something like `cfn-look-up-ami-ids`.

```
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    },
    {
      "Effect": "Allow",
      "Action": [ "ec2:DescribeImages" ],
      "Resource": "*"
    }
  ]
}
```

## CloudFormation Example Usage

Use a CloudFormation Parameter to define the pattern to match against when
searching for the AMI by Name. In the example below, the default value of the
parameter `AmiNameStringSearch` is set to match the naming pattern Amazon uses
for their Windows Server 2012 R2 AMIs.

```
  "Parameters" : {
    "AmiNameSearchString" : {
        "Description" : "Search pattern to match against an AMI Name",
        "Type" : "String",
        "Default" : "Windows_Server-2012-R2_RTM-English-64Bit-Base-*"
    }
  },
```

When the `AutoUpdateAmi` parameter is set to NO the function will return the
AMI ID that was originally passed via `TemplateAmiID` ( which pulls its value
from the `AmiId` parameter) otherwise the most recent AMI found using the
provided search string is returned.

```
"AutoUpdateAmi" : {
   "Description" : "Always check for latest AMI using the provided search string during stack updates",
   "Type" : "String",
   "Default" : "YES",
   "AllowedValues" :
      [
        "YES",
        "NO"
      ]
    },
```

Define your desired AMI ID here and set the `AutoUpdateAmi` toggle to NO to
prevent auto updates of the EC2 resources on stack update.

```
"AmiId" :
{
    "Description" : "(Optional) AMI ID -- will supersede Lambda-based AMI lookup using AmiNameSearchString",
    "Type" : "String",
    "Default" : "ami-XXXXXXXX"
}
```

Call the Lambda function using a custom CloudFormation resource. This resource
will return with an attribute named `Id` containing the AMI ID. Use the
function `Fn::GetAtt` to reference this attribute within the `ImageId`
property of the instance (or launch configuration).

```
  "Resources" : {
    "AmiIdLookup": {
      "Type": "Custom::AmiIdLookup",
      "Properties": {
        "ServiceToken": {
          "Fn::Join" : [
            ":",
            [
              "arn:aws:lambda",
              { "Ref" : "AWS::Region" },
              { "Ref" : "AWS::AccountId" },
              "function:cfn-look-up-ami-ids"
            ]
          ]
        },
        "Region": { "Ref" : "AWS::Region" },
        "AmiNameSearchString": { "Ref" : "AmiNameSearchString" },
        "TemplateAmiID" : { "Ref" : "AmiId" },
        "AutoUpdateAmi" : { "Ref" : "AutoUpdateAmi" }
      }
    },
    "MyInstance" :
    {
      "Type" : "AWS::EC2::Instance",
      "Properties" : {
        "ImageId": { "Fn::GetAtt": [ "AmiIdLookup", "Id" ] },
        # ... elided ...
      }
    }
  }
```
