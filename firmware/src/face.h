#pragma once
#include <Arduino.h>

enum FaceState { FACE_IDLE, FACE_LISTENING, FACE_THINKING, FACE_HAPPY, FACE_SAD, FACE_SLEEP, FACE_MESSAGE };

void faceBegin();
void faceSet(FaceState s);
void faceLevel(float level01);                       // volumen 0..1 mientras escucha
void faceMessage(const char *line1, const char *line2 = "", const char *line3 = "");
