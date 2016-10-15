# AWS Claudia AWSBot
A Slack bot to stop and start selected AWS instances and generally keep
an eye on your AWS estate. The following commands are available:

    /awsbot help
    /awsbot show all
    /awsbot show running
    /awsbot show stopped
    /awsbot start instance_name
    /awsbot stop instance_name

Clearly, anyone with access to your Slack channel will be able to stop and
start your instances so use with caution.

The bot is written in Node.js and
runs in AWS Lambda via the API Gateway.
It is deployed  using Claudia.js - see
https://claudiajs.com/.

## Installation

See https://claudiajs.com/tutorials/hello-world-chatbot.html.


Follow the tutorial but use the following commands:

    npm init
    npm install claudia-bot-builder -S
    npm install promise-delay -S
    npm install aws-sdk -S

Put bot.js in the project folder.

Deploy to AWS with the following command:

    claudia create --region eu-west-1 --api-module bot  --configure-slack-slash-app

Go to https://api.slack.com/ to configure your Slack team.

That's it, you're done.

If you modify the bot.js code, you can redeploy with:

    claudia create --region eu-west-1 --api-module bot
