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

      return {
        fallback: `${status.InstanceId} / ${event.Code} / ${eventFrom} - ${eventTo} / ${event.Description}`,
        color: color,
        fields: [
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
        ],
      };
    });
  }).filter(a => a.length > 0).reduce((r, v) => r.concat(v), []).filter(a => a != null);
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
    let attachments = this.constructAttachments(statuses, new Date(), timezone);

    if (attachments.length == 0) {
      return {};
    }

    let message = {
      text: ':warning: There are some EC2 Scheduled Events. :warning:',
      attachments: attachments,
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
