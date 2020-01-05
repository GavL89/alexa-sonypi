var awsIot = require('aws-iot-device-sdk');
const cmdLineProcess = require('./lib/cmdline');
const BraviaRemoteControl = require('sony-bravia-tv-remote-v2');
const axios = require('axios').default;

const remote = new BraviaRemoteControl(process.env.IP, 80, process.env.CODE);

function mainProcess(args) {
   //
   // The device module exports an MQTT instance, which will attempt
   // to connect to the AWS IoT endpoint configured in the arguments.
   // Once connected, it will emit events which our application can
   // handle.
   //
   const device = awsIot.device({
      keyPath: process.env.PRIVATEKEY,
      certPath: process.env.CLIENTCERTIFICATES,
      caPath: process.env.CACERTIFICATE,
      clientId: process.env.CLIENTID,
      region: args.region,
      baseReconnectTimeMs: args.baseReconnectTimeMs,
      keepalive: args.keepAlive,
      protocol: args.Protocol,
      port: args.Port,
      host: process.env.HOSTNAME,
      debug: args.Debug
   });

   const iotTopic = "tv_topic/" + process.env.DEVICE;

   device.subscribe(iotTopic);

   device.on('connect', function() {
      console.log('connect');
      console.log(process.env.NAME + ' is connected')
      console.log("Listening on the topic: " + iotTopic);
      console.log("TV IP address has been set to: " + process.env.IP);
   });
   device.on('close', function() {
         console.log('close');
      });
   device.on('reconnect', function() {
      console.log('reconnect');
   });
   device.on('offline', function() {
      console.log('offline');
   });
   device.on('error', function(error) {
      console.log('error', error);
   });
   device.on('message', function(topic, payload) {
      console.log('message', topic, payload.toString());
      tvActions(JSON.parse(payload));
   });
}

module.exports = cmdLineProcess;

if (require.main === module) {
   cmdLineProcess(
      'connect to the AWS IoT service and publish/subscribe to topics using MQTT, test modes 1-2',
      process.argv.slice(2), 
      mainProcess
   );
}

async function tvActions(payload) {
   // Set the IP address of the TV based on payload.tv
   console.log("Performing action " + payload.action + ' on ' + payload.task);

   switch (payload.source) {
      case "Alexa.PowerController":
         // The On/Off Actions from Alexa
         switch (payload.action) {
            case "ON":
               remote.sendAction('PowerOn');
               break;
            case "OFF":
               remote.sendAction('PowerOff');
               break;
         }
         break;
      case "Alexa.Speaker":
         // Mute and Volume
         switch (payload.task) {
            // There is true or false values for mute, but this API for the TV doesn't differentiate 
            case "muted":
               remote.sendAction('Mute');
               break;
            case "volume":
               changeVolume(payload.action);
               break;
         }
         break;
      case "Alexa.PlaybackController":
         // Control play, pause or stop, get the aaction directly from the payload
         remote.sendAction(payload.action);
         break;
      case "Alexa.InputController":
         // Change the device input
         changeInput(payload.action);
         break;
      case "Alexa.ChannelController":
         // Change the TV channel
         changeChannel(payload.action)
         break;
   }
} 

function changeChannel(channel) {
   const channelNumber = channel.match(/\d/g).join("");

   console.log('Setting channel to ' + channelNumber);

   for (var i = 0; i < channelNumber.length; i++) {
      (function (i) {
         setTimeout(function () {
            console.log("Pressing " + channelNumber[i]);
            remote.sendAction("Num" + channelNumber[i]);
         }, 1000*i);
       })(i);
   }
};

function changeVolume(volume) {
   for (var i = 0; i < 5; i++) {
      (function (i) {
         setTimeout(function () {
            if (String(volume).includes('-')) {
               // Reduce the volume
               console.log('Down');
               remote.sendAction("VolumeDown");
            } else {
               // Increase the volume
               console.log('Up');
               remote.sendAction("VolumeUp");
            }
         }, 1000*i);
       })(i);
   }
};

async function changeInput(input) {
   var transformedInput = String(input).replace(process.env.NAME, '');
   transformedInput = transformedInput.trim();
   transformedInput = 'DEVICE__' + transformedInput.replace(/ /g, '_').toUpperCase();
   
   const deviceMapping = process.env[transformedInput]
   
   console.log('Changing input to ' + deviceMapping);

   const options = {
      headers: {
         'X-Auth-PSK': process.env.CODE
      }
   };

   const data = await axios.post(`http://${process.env.IP}/sony/avContent`, {
      method: "setPlayContent",
      id: 101,
      params: [
         {
            uri: deviceMapping
         }
      ],
      version: "1.0"
   }, options)
   .then(function (response) {
      const data = response.data;
      console.log(data);
   })
   .catch(function (error) {
      console.log(error);
   });
};