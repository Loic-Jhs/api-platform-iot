const mqtt = require("mqtt");
const client = mqtt.connect("mqtt://test.mosquitto.org");
const SerialPort = require("serialport");
const xbee_api = require("xbee-api");
const C = xbee_api.constants;

// MAC Network
macEntree = null;
macSortie = null;

require("dotenv").config();
let lastReceivedMessage = ""; // Garder une trace du dernier message envoyé

client.on("connect", function () {
  console.log("Connected to MQTT broker");

  // Subscribe to the topic
  client.subscribe("parking/barriere/entree", function (err) {
    if (!err) {
      console.log("Subscribed to topic parking/barriere/entree");
    } else {
      console.error("Failed to subscribe: ", err);
    }
  });

  client.subscribe("parking/barriere/sortie", function (err) {
    if (!err) {
      console.log("Subscribed to topic parking/barriere/sortie");
    } else {
      console.error("Failed to subscribe: ", err);
    }
  });
});

let isResponding = false; // Drapeau pour indiquer si une réponse est en cours

client.on("message", function (topic, message) {
  const receivedMessage = message.toString();
  // console.log(`Received message: ${receivedMessage} on topic: ${topic}`);

  // Vérifier si le message reçu est différent du dernier envoyé
  if (!isResponding && receivedMessage !== lastReceivedMessage) {
    // Activer le drapeau pour indiquer qu'une réponse est en cours
    isResponding = true;

    // Traitement des messages reçus
    if (
      topic === "parking/barriere/entree" ||
      topic === "parking/barriere/sortie"
    ) {
      // Envoyer la commande à l'Arduino via XBee
      sendCommandToArduino(receivedMessage, topic);
    }

    // Publier un message de réponse sur le même sujet
    client.publish(
      "parking/barriere/sortie",
      `Received your message: ${receivedMessage}`
    );
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

    // {
    //   type: 149,
    //   sender64: '0013a20041582fc0',
    //   sender16: '70d4',
    //   receiveOptions: 2,
    //   remote16: '70d4',
    //   remote64: '0013a20041582fc0',
    //   nodeIdentifier: 'entree',
    //   remoteParent16: 'fffe',
    //   deviceType: 1,
    //   sourceEvent: 3,
    //   digiProfileID: 'c105',
    //   digiManufacturerID: '101e'
    // }

    if (frame.nodeIdentifier === "entree") macEntree = frame.remote64;
    if (frame.nodeIdentifier === "sortie") macSortie = frame.remote64;

    // Handle node identification
    // storage.registerSensor(frame.remote64)
  } else if (C.FRAME_TYPE.ZIGBEE_IO_DATA_SAMPLE_RX === frame.type) {
    console.log("ZIGBEE_IO_DATA_SAMPLE_RX");
    console.log(frame.analogSamples.AD0); // Trier les valeurs du photocapteur
    // console.log("FRAME LOG", frame.remote64, macEntree);

    if (frame.remote64 === macEntree && frame.analogSamples.AD0 < 800) {
      // envoi d'instruction d'ouverture 0x10: ZigBee Transmit Request
      openDoor(frame.remote64);
    } else if (frame.remote64 === macSortie && frame.analogSamples.AD > 800) {
      closeDoor(frame.remote64);
    }
    client.publish("parking/barriere/entree", "" + frame.analogSamples.AD0);

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

function openDoor(remote64) {
  sendCommand(remote64, "open");
}

function closeDoor(remote64) {
  sendCommand(remote64, "close");
}

function sendCommand(remote64, instruction) {
  if (!remote64) {
    return;
  }
  let frame_obj = {};
  console.log("///", remote64);
  frame_obj = {
    type: C.FRAME_TYPE.ZIGBEE_TRANSMIT_REQUEST, // xbee_api.constants.FRAME_TYPE.ZIGBEE_TRANSMIT_REQUEST
    destination64: remote64.remoteAddress, //Envoyer l'adresse MAC en dynamique
    data: instruction, // Can either be string or byte array.
  };
  xbeeAPI.builder.write(frame_obj);
}

function sendCommandToArduino(topic) {
  let destination64 = ""; // Remplacez par l'adresse MAC du module XBee connecté à l'Arduino

  if (topic === "parking/barriere/entree") {
    openDoor(macEntree);
  } else if (topic === "parking/barriere/sortie") {
    openDoor(macSortie);
  }

  sendCommand(destination64);
}
