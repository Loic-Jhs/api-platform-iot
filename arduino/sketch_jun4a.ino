#include <Servo.h>  // Inclusion de la bibliothèque Servo pour contrôler le servomoteur
#include <SoftwareSerial.h>
#include <String.h>

Servo barriereServo;  // Création d'un objet Servo pour contrôler la barrière
int position = 0;     // Variable pour la position initiale du servomoteur

int closePosition = 80;
int openPosition = 10;

String xbeeData = "";

SoftwareSerial Xbee(0, 1);

void setup() {
  Serial.begin(9600);    // Initialisation de la communication série à 9600 bauds
  barriereServo.attach(11); // Attache le servomoteur à la broche 11 de l'Arduino
  barriereServo.write(closePosition); // Initialise le servomoteur à la position 0 (barrière fermée)
  Xbee.begin(9600);
}

void loop() {
  // openBarrier();
  // delay(1000);
  // closeBarrier();
  // delay(1000);

  if (Xbee.available() > 0) {
    xbeeData = "";
    do {
      xbeeData += (char) Xbee.read();
    } while(Xbee.available() > 0);
    Serial.println(xbeeData.indexOf("open"));
    if(xbeeData.indexOf("open") > -1) {
      openBarrier();
    } else if(xbeeData.indexOf("close") > -1) {
      closeBarrier();
    }
  }
  delay(50);
}

void openBarrier() {
  Serial.println("ON OUVRE");
  barriereServo.write(openPosition); // Position d'ouverture (ajuster si nécessaire)
  position = openPosition;
}

void closeBarrier() {
  Serial.println("ON FERME");
  barriereServo.write(closePosition); // Position de fermeture (ajuster si nécessaire)
  position = closePosition;
}
