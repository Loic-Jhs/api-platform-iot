var SerialPort = require("serialport");
var xbee_api = require("xbee-api");
var C = xbee_api.constants;

require("dotenv").config();
const mqtt = require("mqtt");
const client = mqtt.connect("mqtt://test.mosquitto.org");
let lastReceivedMessage = ""; // Garder une trace du dernier message envoyé

client.on("connect", function () {
  console.log("Connected to MQTT broker");

  // Subscribe to the topic
  client.subscribe("test/topic", function (err) {
    if (!err) {
      console.log("Subscribed to topic test/topic");
    } else {
      console.error("Failed to subscribe: ", err);
    }
  });

  client.subscribe("enterDoor/state", function (err) {
    if (!err) {
      console.log("Subscribed to topic enterDoor/state");
    } else {
      console.error("Failed to subscribe: ", err);
    }
  });
});

/** //TODO
 * Créer un subscriber d'ouverture et de fermeture de barrière
 * Pour l'envoie des données du photocapteur utiliser => 0x10: ZigBee Transmit Request (ZNet, ZigBee) https://github.com/jankolkmeier/xbee-api?tab=readme-ov-file#0x10-zigbee-transmit-request-znet-zigbee
 * Faire du conditionnel pour trier les data du photo capteur
 * Condition d'entré :
 *   => Si data < ~1200 sur 1er capteur = barrière ouverte
 *     => Si data < ~1200 sur 2e capteur = barrière fermée && place de parking -1
 * Condition de sortie :
 *   => Si data < ~1200 sur 1er capteur = barrière ouverte
 *     => Si data < ~1200 sur 2e capteur = barrière fermée && place de parking +1
 */

let isResponding = false; // Drapeau pour indiquer si une réponse est en cours

client.on("message", function (topic, message) {
  const receivedMessage = message.toString();
  console.log(`Received message: ${receivedMessage} on topic: ${topic}`);

  // Vérifier si le message reçu est différent du dernier envoyé
  if (!isResponding && receivedMessage !== lastReceivedMessage) {
    // Activer le drapeau pour indiquer qu'une réponse est en cours
    isResponding = true;

    // Publier un message de réponse sur le même sujet
    client.publish("test/topic", `Received your message: ${receivedMessage}`);
    lastReceivedMessage = receivedMessage; // Mettre à jour le dernier message envoyé

    // Désactiver le drapeau après un court délai
    setTimeout(() => {
      isResponding = false;
    }, 1000); // Délai de 1 seconde pour réactiver la réception des messages
  }
});

// To keep the script running and listening for messages
process.stdin.resume();

const SERIAL_PORT = process.env.SERIAL_PORT;

if (!SERIAL_PORT) {
  console.error("Please set SERIAL_PORT in your .env file");
  process.exit(1);
}

var xbeeAPI = new xbee_api.XBeeAPI({
  api_mode: 2,
});

let serialport = new SerialPort(
  SERIAL_PORT,
  {
    baudRate: parseInt(process.env.SERIAL_BAUDRATE) || 9600,
  },
  function (err) {
    if (err) {
      return console.log("Error: ", err.message);
    }
  }
);

serialport.pipe(xbeeAPI.parser);
xbeeAPI.builder.pipe(serialport);

serialport.on("open", function () {
  var frame_obj = {
    // AT Request to be sent
    type: C.FRAME_TYPE.AT_COMMAND,
    command: "NI",
    commandParameter: [],
  };

  xbeeAPI.builder.write(frame_obj);

  frame_obj = {
    // AT Request to be sent
    type: C.FRAME_TYPE.REMOTE_AT_COMMAND_REQUEST,
    destination64: "FFFFFFFFFFFFFFFF",
    command: "NI",
    commandParameter: [],
  };
  xbeeAPI.builder.write(frame_obj);
});

// All frames parsed by the XBee will be emitted here
xbeeAPI.parser.on("data", function (frame) {
  if (C.FRAME_TYPE.ZIGBEE_RECEIVE_PACKET === frame.type) {
    console.log("C.FRAME_TYPE.ZIGBEE_RECEIVE_PACKET");
    let dataReceived = String.fromCharCode.apply(null, frame.data);
    console.log(">> ZIGBEE_RECEIVE_PACKET >", dataReceived);
  } else if (C.FRAME_TYPE.NODE_IDENTIFICATION === frame.type) {
    console.log("NODE_IDENTIFICATION");
    console.log(frame);
    // Handle node identification
    // storage.registerSensor(frame.remote64)
  } else if (C.FRAME_TYPE.ZIGBEE_IO_DATA_SAMPLE_RX === frame.type) {
    console.log("ZIGBEE_IO_DATA_SAMPLE_RX");
    //console.log(frame.analogSamples.AD0);

    if (frame.analogSamples.AD0 < 800) {
      // envoi d'instruction d'ouverture 0x10: ZigBee Transmit Request
      let frame_obj = {};
      frame_obj = {
        type: 0x10, // xbee_api.constants.FRAME_TYPE.ZIGBEE_TRANSMIT_REQUEST
        destination64: "", //Envoyer l'adresse MAC en dynamique
        data: "TxData0A", // Can either be string or byte array.
      };
    } else if (frame.analogSamples.AD > 800) {
      // envoi d'instruction de fermeture 0x10: ZigBee Transmit Request
      let frame_obj = {};
      frame_obj = {
        type: 0x10, // xbee_api.constants.FRAME_TYPE.ZIGBEE_TRANSMIT_REQUEST
        destination64: "", //Envoyer l'adresse MAC en dynamique
        data: "TxData0A", // Can either be string or byte array.
      };
    }
    client.publish("enterDoor/state", "" + frame.analogSamples.AD0);

    // Handle I/O data sample
    // storage.registerSample(frame.remote64, frame.analogSamples.AD0)
  } else if (C.FRAME_TYPE.REMOTE_COMMAND_RESPONSE === frame.type) {
    console.log("REMOTE_COMMAND_RESPONSE");
  } else {
    console.debug(frame);
    if (frame.commandData) {
      let dataReceived = String.fromCharCode.apply(null, frame.commandData);
      console.log(dataReceived);
    }
  }
});
