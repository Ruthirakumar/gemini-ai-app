import type { ListenError } from "./useSpeech";

/** What to tell the child when listening fails. */
export const LISTEN_ERRORS: Record<ListenError, string> = {
  "not-allowed":
    "Homework Buddy isn't allowed to use the microphone. Ask a grown-up to click the padlock next to the web address, allow the microphone, then try again. Or type instead.",
  "no-speech": "I didn't hear anything. Tap the microphone and try again, a little louder.",
  "audio-capture": "No microphone was found. Check one is plugged in and switched on, or type instead.",
  network: "Talking needs the internet in this browser and it couldn't connect. Please try again, or type instead.",
  unknown: "Something went wrong with listening. Please try again, or type instead.",
};
