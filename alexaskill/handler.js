'use strict';
const AWS = require('aws-sdk');
const iotdata = new AWS.IotData({endpoint: process.env.iotEndpoint, region: 'ap-southeast-2'});

module.exports.alexaskill = async event => {
  console.log("REQUEST:");
  console.log(JSON.stringify(event));

  const directive = event.directive;
  let response;
  let action;

  // Now for the massive switch of fun, all of the responses are slightly different and can be determined from the request.
  // Each response follows the same structure though as the other though.
  switch (directive.header.namespace) {
    case "Alexa.Discovery": // If devices are being discovered
      response = DiscoverDevices(directive);
      break;
    case "Alexa.PowerController": // If devices need to be switched on and off
      switch (directive.header.name) {
        case 'TurnOn':
          action = 'ON';
          break;
        case 'TurnOff':
          action = 'OFF';
          break;
      }
      await PerformAction(directive, action, 'power');
      response = GenerateActionResponse(directive, 'powerState', action); 
      break;
    case "Alexa.Speaker": // If devices are being muted or their volume changed
      switch (directive.header.name) {
        case 'SetMute':
          action = directive.payload.mute;
          await PerformAction(directive, action, 'muted');
          response = GenerateActionResponse(directive, 'muted', action)
          break;
        case "AdjustVolume":
          const volume = directive.payload.volume;
          await PerformAction(directive, volume, 'volume');
          response = GenerateActionResponse(directive, 'volume', volume)
          break;
      }
      break;
    case "Alexa.PlaybackController": // If wanting to play, pause and stop
      action = directive.header.name;
      await PerformAction(directive, action, 'control');
      response = GenerateActionResponse(directive, 'control', action);
      break;
    case "Alexa.InputController": // If changing the input
      action = directive.payload.input;
      await PerformAction(directive, action, 'input');
      response = GenerateActionResponse(directive, 'input', action);
      break;
    case "Alexa.ChannelController": // If changing the channel
      action = directive.payload.channel.number || directive.payload.channelMetadata.name;
      await PerformAction(directive, action, 'channel');
      const channel = {
        number: action
      }
      response = GenerateActionResponse(directive, 'channel', channel);
      break;
  }

  console.log("RESPONSE:");
  console.log(JSON.stringify(response));

  return response;
};

//#region DiscoverDevices
// Function used to discover the TVs in the house
function DiscoverDevices(directive) {
  // START - Generic Capabilities
  // These are some generic capabilities which most TVs will support.
  // Ideally, this would be done as self-discovery by the Pi and put into DynamoDB, but this is really just hacked together.
  const powerControllerCapability = GenerateCapability(
    "Alexa.PowerController",
    directive.header.payloadVersion,
    [ { name: "powerState" } ]
  );

  const speakerCapability = GenerateCapability(
    "Alexa.Speaker",
    directive.header.payloadVersion,
    [
      { name: "volume" },
      { name: "muted" }
    ]
  )

  const playbackControllerCapability = GenerateCapability(
    "Alexa.PlaybackController",
    directive.header.payloadVersion,
    [],
    [ "Play", "Stop", "Pause" ]
  )

  const channelControllerCapability = GenerateCapability(
    "Alexa.ChannelController",
    directive.header.payloadVersion,
    [ { name: "channel" } ]
  );

  const alexaInterfaceCapability = {
    type: "AlexaInterface",
    interface: "Alexa",
    version: directive.header.payloadVersion
  };
  // END - Generic Capabilities

  // START - TV 1
  // These inputs are specific to this particular TV.
  // Ideally this would also be done as self-discovery by the Pi and put into DynamoDB, but this is really just hacked together.
  const tv1InputControllerCapability = GenerateCapability(
    "Alexa.InputController",
    directive.header.payloadVersion,
    [],
    [],
    [
      { name: "MEDIA PLAYER"}, // This is my Apple TV
      { name: "BLURAY" }, // Self explanatory
      { name: "HDMI 4"},  // This is the amplifer in the event Apple TV or Bluray aren't picked up by CEC or if I want to use something else not CEC enabled
    ]
  );

  // These are the capabilities of this TV
  const tv1Capabilities = [
    powerControllerCapability,
    speakerCapability,
    playbackControllerCapability,
    tv1InputControllerCapability,
    channelControllerCapability,
    alexaInterfaceCapability
  ];

  // This is the TV itself 
  const tv1 = GenerateEndpoint(
    "tv1", // Unique TV Id, this can be anything as long as it is unique to all TVs
    "TV 1", // The name of the TV which you'll use when talking to Alexa
    "The family room tv", // A description, can be anything
    "Gavin-Sony", // The manufacturer of the TV
    tv1Capabilities, 
    directive.header.payloadVersion
  );
  // END - TV 1

  const endpoints = [
    tv1
  ]

  const response = {
    event: {
      header: {
        namespace: directive.header.namespace,
        name: "Discover.Response",
        payloadVersion: directive.header.payloadVersion,
        messageId: directive.header.messageId
      },
      payload: {
        endpoints: endpoints
      }
    }
  }

  return response;
}

// Function used to generate the TV endpoint
function GenerateEndpoint(id, name, description, manufacturer, capabilities) {
  const endpoint = {
    endpointId: id,
    friendlyName: name,
    description: description,
    manufacturerName: manufacturer,
    displayCategories: [ "TV" ],
    capabilities: capabilities
  }
  
  return endpoint;
}

// Function used to generate each capability of the TV
function GenerateCapability(interfacename, version, supportedProperties, supportedOperations, inputs) {
  const capability = {
    type: "AlexaInterface",
    interface: interfacename,
    version: version,
    properties: {
      supported: supportedProperties || [], // Array of object
      proactivelyReported: true,
      retrievable: true
    },
    supportedOperations: supportedOperations || [], // Array of string
    inputs: inputs || [], // Array of object
    proactivelyReported: true,
    retrievable: true
  }

  return capability;
}
//#endregion DiscoverDevices

//#region generic actions and responses
// Function used to put a message into the topic for consumption by the Pi
async function PerformAction(directive, action, task) {
  const endpointId = directive.endpoint.endpointId;
  const topic = process.env.iotTopic + '/' + endpointId;

  const message = {
    source: directive.header.namespace,
    action: action,
    task: task || '',
  };

  const params = {
    topic: topic,
    payload: JSON.stringify(message)
  };

  const result = await iotdata.publish(params).promise();
  return result;
}

// Generates a response to send back to Amazon to confirm the action was received and has occur
function GenerateActionResponse(directive, state, action) {
  const response = {
    event: {
      header: {
        namespace: "Alexa",
        name: "Response",
        messageId: directive.header.messageId,
        correlationToken: directive.header.correlationToken,
        payloadVersion: directive.header.payloadVersion
      },
      endpoint: {
        scope: {
          type: directive.endpoint.scope.type,
          token: directive.endpoint.scope.token
        },
        endpointId: directive.endpoint.endpointId,
      },
      payload: {},
      context: {
        properties: [
          {
            namespace: directive.header.namespace,
            name: state,
            value: action,
            timeOfSample: new Date(),
            uncertaintyInMilliseconds: 500
          }
        ]
      }
    }
  };
  return response;
}
//#endregion generic actions and responses