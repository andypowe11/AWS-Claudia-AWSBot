'use strict';

const promiseDelay = require('promise-delay');
const AWS = require('aws-sdk');
const botBuilder = require('claudia-bot-builder');
const lambda = new AWS.Lambda();
const slackDelayedReply = botBuilder.slackDelayedReply;

const starters = [ // The instances that this bot is allowed to start
  "name1",
  "name2",
  "name3"
];
const stoppers = [ // The instances that this bot is allowed to stop
  "name1",
  "name4"
];

const api = botBuilder((message, apiRequest) => {
  // console.log('Received message:', JSON.stringify(message, null, 2));
  var resp = '';
  if (message.text == 'show all' ||
      message.text == 'show running' ||
      message.text == 'show stopped' ||
      message.text.substr(0, 6) == 'start ' ||
      message.text.substr(0, 5) == 'stop ') {
    // Invoke the same Lambda function asynchronously.
    // Do not wait for the response.
    // This allows the initial request to end within three seconds,
    // as requiured by Slack.
    return new Promise((resolve, reject) => {
      lambda.invoke({
  	FunctionName: apiRequest.lambdaContext.functionName,
  	InvocationType: 'Event',
  	Payload: JSON.stringify({
          slackEvent: message // This will enable us to detect the
                              // event later and filter it.
        }),
  	Qualifier: apiRequest.lambdaContext.functionVersion
      }, (err, done) => {
        if (err) return reject(err);
        resolve();
      });
    })
      .then(() => {
        if (message.text.substr(0, 6) == 'start ')
          resp = "Hang on... let me try to start that for you.";
        else if (message.text.substr(0, 5) == 'stop ')
          resp = "Hang on... let me try to stop that for you.";
        else
          resp = "Hang on... I'll check your instances and get back to you.";
        return { // the initial response
          text: `${resp}`,
          response_type: 'in_channel'
        }
      })
      .catch(() => {
        return `Sorry, I'm having trouble functioning right now :(`
      });
  }
  else if (message.text == 'help') {
    return {
      text: `Try one of 'show all', 'show running', 'show stopped', 'start instance_name' or 'stop instance_name'.`,
      response_type: 'ephemeral'
    }
  }
  else {
    return {
      text: `Sorry, I have no idea what you are banging on about.`,
      response_type: 'ephemeral'
    }
  }
});

// this will be executed before the normal routing.
// we detect if the event has a slackEvent flag, and
// if so, avoid normal procesing, running a delayed response instead

api.intercept((event) => {
  if (!event.slackEvent) // if this is a normal web request, let it run
    return event;

  // console.log('Received slackEvent:', JSON.stringify(event, null, 2));
  var resp = '';
  var mydata;
  const message = event.slackEvent;
  // console.log('Message:', JSON.stringify(message, null, 2));
  // console.log('Message:', message.text);

  if (message.text == 'show all' ||
      message.text == 'show running' ||
      message.text == 'show stopped') {
    var ec2 = new AWS.EC2();
    return new Promise((resolve, reject) => {
      ec2.describeInstances({}, (err, data) => {
        if (err) return reject(err);
        mydata = data;
        resolve();
      });
    })
      .then(() => {
        resp += "Here's a list of your ";
        if (message.text == 'show running') resp += "running ";
        if (message.text == 'show stopped') resp += "stopped ";
        resp += "AWS instances: \n";
        // console.log('Response:', JSON.stringify(mydata, null, 2) + "\n");
        var iname, iid, iowner, istate, ipubip;
        var r, i, t;
        for (r=0; r < mydata.Reservations.length; ++r) {
          for (i=0; i < mydata.Reservations[r].Instances.length; ++i) {
            iname = '';
            iid = '';
            iowner = '';
            istate = '';
            ipubip = '';
            iid = mydata.Reservations[r].Instances[i].InstanceId;
            istate = mydata.Reservations[r].Instances[i].State.Name;
            ipubip = mydata.Reservations[r].Instances[i].PublicIpAddress;
            for (t=0; t< mydata.Reservations[r].Instances[i].Tags.length; ++t) {
              if (mydata.Reservations[r].Instances[i].Tags[t].Key == "Name") {
                iname = mydata.Reservations[r].Instances[i].Tags[t].Value;
              }
              if (mydata.Reservations[r].Instances[i].Tags[t].Key == "Owner") {
                iowner = mydata.Reservations[r].Instances[i].Tags[t].Value;
              }
            }
            if (istate == "running") iname = "*"+iname+"*";
            else if (istate == "stopped") iname = "_"+iname+"_";
            if (message.text == 'show all' ||
               (message.text == 'show running' && istate == "running") ||
               (message.text == 'show stopped' && istate == "stopped")) {
              resp += iname + " (" + iid + ") ";
              if (message.text == 'show all') resp += istate + " - ";
              resp += iowner;
              if (ipubip != undefined) resp += " " + ipubip;
              resp += "\n";
            }
          }
        }
        return slackDelayedReply(message, {
          text: `${resp}`,
          response_type: 'in_channel'
        })
      })
      .then(() => false); // prevent normal execution
  }
  else if (message.text.substr(0, 6) == 'start ' ||
           message.text.substr(0, 5) == 'stop ') {
    var iid, istate;
    var action = 'start';
    if (message.text.substr(0, 5) == 'stop ') action = 'stop';
    var iname = message.text.substr(6);
    if (action == 'stop') iname = message.text.substr(5);
    var ec2 = new AWS.EC2();
    return new Promise((resolve, reject) => {
      if ((action == 'start' && starters.indexOf(iname) == -1) ||
          (action == 'stop' && stoppers.indexOf(iname) == -1)) {
        if ((action == 'start' && starters.length > 0) ||
            (action == 'stop' && stoppers.length > 0)) {
          resp = "Sorry, I'm not allowed to "+action+" "+iname+" - I can only "+action+" one of the following: ";
          if (action == 'start') resp += starters.join(', ');
          if (action == 'stop') resp += stoppers.join(', ');
        }
        else {
          resp = "Sorry, I'm not allowed to "+action+" anything.";
        }
        resolve();
      }
      else {
        ec2.describeInstances({}, (err, data) => {
          if (err) return reject(err);
          mydata = data;
          resolve();
        });
      }
    })
      .then(() => {
        if (mydata != undefined) {
          var r, i, t;
          iid = '';
          console.log('EC2 Response:', JSON.stringify(mydata, null, 2) + "\n");
          for (r=0; r < mydata.Reservations.length; ++r) {
            for (i=0; i < mydata.Reservations[r].Instances.length; ++i) {
              for (t=0; t< mydata.Reservations[r].Instances[i].Tags.length; ++t) {
                if (mydata.Reservations[r].Instances[i].Tags[t].Key == "Name" &&
                    iname
                        == mydata.Reservations[r].Instances[i].Tags[t].Value) {
                    iid = mydata.Reservations[r].Instances[i].InstanceId;
                    istate = mydata.Reservations[r].Instances[i].State.Name;
                }
              }
            }
          }
          if (iid == '') {
            resp = "Sorry, I can't find an instance called "+iname+".";
          }
          else if (action == 'start' && istate == "running") {
            resp = "Hmmm... "+iname+" ("+iid+") is already running.";
          }
          else if (action == 'stop' && istate == "stopped") {
            resp = "Hmmm... "+iname+" ("+iid+") is already stopped.";
          }
          else {
            if (action == 'start')
              var req = ec2.startInstances({ "InstanceIds" : [ iid ] });
            else
              var req = ec2.stopInstances({ "InstanceIds" : [ iid ] });
            req.send();
            resp = "OK, I've tried to "+action+" "+iname+" ("+iid+") - give it a couple of minutes and then check its status.";
          }
        }
        return slackDelayedReply(message, {
          text: `${resp}`,
          response_type: 'ephemeral'
        })
      })
      .then(() => false); // prevent normal execution
  }
  else if (message.text.substr(0, 5) == 'stop ') {
    return new Promise((resolve, reject) => {
      resolve();
    })
      .then(() => {
        return slackDelayedReply(message, {
          text: `You're kidding, right? You actually thought I'd let you stop something from here! Lolz.`,
          response_type: 'ephemeral'
        })
      })
      .then(() => false); // prevent normal execution
  }
  else {
    return new Promise((resolve, reject) => {
      resolve();
    })
      .then(() => {
        return slackDelayedReply(message, {
          text: `Actually, I have no idea what you are banging on about.`,
          response_type: 'ephemeral'
        })
      })
      .then(() => false); // prevent normal execution
  }
});

module.exports = api;
