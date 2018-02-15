/**
 * A sample Lambda function that looks up the latest AMI ID for a given
 * region and architecture. Make sure to include permissions for
 * `ec2:DescribeImages` in your execution role!
 *
 * See http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/walkthrough-custom-resources-lambda-lookup-amiids.html
 * for documentation on how to use this blueprint.
 */
var aws = require('aws-sdk');
var https = require('https');
var url = require('url');

// Check if the image is a beta or RC image (the Lambda function won't return any of these images)
var isBeta = function(imageName) {
    return imageName.toLowerCase().indexOf('beta') !== -1 || imageName.toLowerCase().indexOf('.rc') !== -1;
};

// Sends a response to the pre-signed S3 URL
var sendResponse = function(event, context, responseStatus, responseData) {
    var responseBody = JSON.stringify({
        Status: responseStatus,
        Reason: "See the details in CloudWatch Log Stream: " + context.logStreamName,
        PhysicalResourceId: context.logStreamName,
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
        Data: responseData
    });

    console.log('RESPONSE BODY:\n', responseBody);

    var parsedUrl = url.parse(event.ResponseURL);
    var options = {
        hostname: parsedUrl.hostname,
        port: 443,
        path: parsedUrl.path,
        method: 'PUT',
        headers: {
            'Content-Type': '',
            'Content-Length': responseBody.length
        }
    };

    var req = https.request(options, function(res) {
        console.log('STATUS:', res.statusCode);
        console.log('HEADERS:', JSON.stringify(res.headers));
        context.succeed('Successfully sent stack response!');
    });

    req.on('error', function(err) {
        console.log('sendResponse Error:\n', err);
        context.fail(err);
    });

    req.write(responseBody);
    req.end();
};

exports.handler = function(event, context) {
    console.log('Received event:', JSON.stringify(event, null, 2));

    var responseStatus = 'FAILED';
    var responseData = {};
    var ec2 = new aws.EC2({ region: event.ResourceProperties.Region });
    var describeImagesParams = {
        Filters: [
            {
                Name: 'name',
                Values: [event.ResourceProperties.AmiNameSearchString]
            }
        ]
    };
    var templateAmiId = event['ResourceProperties']['TemplateAmiID'];
    var autoUpdateAmiId = event['ResourceProperties']['AutoUpdateAmi'];

    if (event.RequestType === 'Delete') {
        sendResponse(event, context, 'SUCCESS');
        return;
    } else if (autoUpdateAmiId === 'NO') {
        responseStatus = 'SUCCESS';
        responseData.Id = templateAmiId;
        console.log('AMI auto update set to NO');
        sendResponse(event, context, responseStatus, responseData);

    } else {
    // Get AMI IDs with the specified name pattern and owner
    ec2.describeImages(describeImagesParams, function(err, data) {
        if (err) {
            responseData = { Error: 'DescribeImages call failed' };
            console.log(responseData.Error + ":\n", JSON.stringify(err, null, 2));
        } else if (data.Images.length === 0) {
            responseData = { Error: 'Search did not return any images' };
            console.log("ERROR: " + responseData.Error);
        } else {
            var images = data.Images;
            // Sort images by name in descending order -- the names contain the AMI version formatted as YYYY.MM.Ver.
            images.sort(function(x, y) { return y.Name.localeCompare(x.Name); });
            for (var i = 0; i < images.length; i++) {
                if (isBeta(images[i].Name)) {
                    continue;
                }
                responseStatus = 'SUCCESS';
                responseData.Id = images[i].ImageId;
                console.log("Found AMI ID: " + responseData.Id);
                break;
            }
        }
        sendResponse(event, context, responseStatus, responseData);
    });
    };
};
