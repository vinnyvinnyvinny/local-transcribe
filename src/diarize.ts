import type { WordTimestamp } from './backends/types.js';

export interface DiarisedSegment {
  speaker: string;
  start: number;
  end: number;
  text: string;
  words?: WordTimestamp[];
}

interface SpeakerInterval {
  speaker: string;
  start: number;
  end: number;
}

/**
 * Compute the overlap (in seconds) between two [start, end) intervals.
 */
function overlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Assign each Whisper word to the speaker segment with maximum time overlap.
 * Words with no overlapping speaker segment are assigned to the nearest speaker
 * (by midpoint proximity) to avoid dropping content.
 *
 * @param words         Word-level timestamps from Whisper.
 * @param segments      Speaker segments from pyannote.
 * @param includeWords  Include per-word timing in each returned segment's `words` array.
 * @returns             Speaker-labelled turns with transcript text.
 */
export function alignWordsToDiarisation(
  words: WordTimestamp[],
  segments: SpeakerInterval[],
  includeWords: boolean,
): DiarisedSegment[] {
  if (words.length === 0 || segments.length === 0) {
    return [];
  }

  // Assign each word to a speaker.
  const wordSpeakers: string[] = words.map((word) => {
    const wordMid = (word.start + word.end) / 2;

    let bestSpeaker: string | null = null;
    let bestOverlap = -1;
    let bestDist = Infinity;

    for (const seg of segments) {
      const ov = overlap(word.start, word.end, seg.start, seg.end);
      if (ov > bestOverlap) {
        bestOverlap = ov;
        bestSpeaker = seg.speaker;
      }
      // Track nearest segment by midpoint for fallback (words outside all segments).
      const segMid = (seg.start + seg.end) / 2;
      const dist = Math.abs(wordMid - segMid);
      if (ov === 0 && dist < bestDist) {
        bestDist = dist;
        if (bestSpeaker === null) {
          bestSpeaker = seg.speaker;
        }
      }
    }

    // If bestOverlap is still 0 (no overlap found), pick nearest by midpoint.
    if (bestOverlap === 0) {
      let nearest: string = segments[0].speaker;
      let nearestDist = Infinity;
      for (const seg of segments) {
        const dist = Math.abs(wordMid - (seg.start + seg.end) / 2);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = seg.speaker;
        }
      }
      return nearest;
    }

    return bestSpeaker ?? segments[0].speaker;
  });

  // Group consecutive words with the same speaker into turns.
  const turns: DiarisedSegment[] = [];

  let i = 0;
  while (i < words.length) {
    const speaker = wordSpeakers[i];
    const turnWords: WordTimestamp[] = [];
    const turnStart = words[i].start;
    let turnEnd = words[i].end;

    while (i < words.length && wordSpeakers[i] === speaker) {
      turnWords.push(words[i]);
      turnEnd = words[i].end;
      i++;
    }

    const text = turnWords.map(w => w.word).join('').trim();

    const segment: DiarisedSegment = {
      speaker,
      start: turnStart,
      end: turnEnd,
      text,
    };

    if (includeWords) {
      segment.words = turnWords;
    }

    turns.push(segment);
  }

  return turns;
}
