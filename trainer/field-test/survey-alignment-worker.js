import {scoreSurveyShifts} from './survey-alignment.js';

self.onmessage = ({data:{pins, references, distance, shift}}) => {
  try {
    self.postMessage({rows:scoreSurveyShifts(pins, references, distance, shift)});
  } catch (error) {
    self.postMessage({error:error.message});
  }
};
