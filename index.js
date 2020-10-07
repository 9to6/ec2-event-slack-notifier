'use strict';

let AWS = require('aws-sdk');
let RP = require('request-promise');
let moment = require('moment-timezone');

exports.constructAttachments = (statuses, now, timezone) => {
  return statuses.map(status => {
    return status.Events.map(event => {
      if (event.Description.match(/^\[Completed\]/)) {
        return null;
      }

      let color = event.NotBefore > now ? 'warning' : 'danger';
      let eventFrom = event.NotBefore == undefined ? '' : moment(event.NotBefore).tz(timezone).format('YYYY-MM-DD kk:mm:ss ZZ');
      let eventTo = event.NotAfter == undefined ? '' : moment(event.NotAfter).tz(timezone).format('YYYY-MM-DD kk:mm:ss ZZ');

      var fields = [
        {
          title: 'Instance',
          value: status.InstanceId,
          short: true,
        },
        {
          title: 'Event Type',
          value: event.Code,
          short: true,
        },
        {
          title: 'Duration',
          value: `${eventFrom} - ${eventTo}`,
          short: false,
        },
        {
          title: 'Description',
          value: event.Description,
          short: false,
        },
      ];
      if (status.Tags != undefined) {
        status.Tags.forEach(tag => {
          if (tag.Key == "Name") {
            fields.push(
              {
                title: 'Name',
                value: tag.Value,
                short: false,
              });
          } else if (tag.Key == "Owner") {
            fields.push(
              {
                title: 'Owner',
                value: "@"+tag.Value,
                short: false,
              });
          }
        })
      }

      return {
        fallback: `${status.InstanceId} / ${event.Code} / ${eventFrom} - ${eventTo} / ${event.Description}`,
        color: color,
        fields: fields,
      };
    });
  }).filter(a => a.length > 0).reduce((r, v) => r.concat(v), []).filter(a => a != null);
}

exports.getTags = (ec2, statuses) => {
  let eventInstanceIds = statuses.map(item => {
    return item.InstanceId;
  })
  var instanceTagInfos = [];
  let ec2DescribePromise = ec2.describeInstances({InstanceIds: eventInstanceIds}).promise();

  return ec2DescribePromise.then(data => {
    statuses.forEach((e, index) => e.Tags = data.Reservations[index].Instances[0].Tags);
    return statuses
  }).catch(err => {
    return statuses;
  })
}

exports.handler = (event, context, callback) => {
  let timezone = process.env.TZ;      // e.g. Asia/Tokyo
  let slackChannel = process.env.SLACK_CHANNEL;      // e.g. Asia/Tokyo
  let webHookURL = process.env.WEBHOOK_URL;

  if (!process.env.TZ && timezone != '') {
    process.env.TZ = timezone;
  }

  let ec2 = new AWS.EC2();
  let describeInstanceStatusPromise = ec2.describeInstanceStatus().promise();

  describeInstanceStatusPromise.then(data => {
    let statuses = data.InstanceStatuses.filter(v => v.Events.length > 0);
    return statuses;
  }).then(statuses => {
    return this.getTags(ec2, statuses)
  }).then(statuses =>  {
    let attachments = this.constructAttachments(statuses, new Date(), timezone);

    if (attachments.length == 0) {
      return {};
    }

    let message = {
      text: ':warning: There are some EC2 Scheduled Events. :warning:',
      attachments: attachments,
      link_names: 1
    };
    if (slackChannel) {
      message['channel'] = slackChannel;
    }

    let options = {
      method: 'POST',
      uri: webHookURL,
      body: message,
      json: true,
    };

    return RP(options);
  }).then(data => {
    callback(null, data);
  }).catch(err => {
    callback(err);
  });
};
