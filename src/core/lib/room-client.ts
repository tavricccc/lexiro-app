// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
"use client";

import type { PracticeQuestionTask } from "@/core/types";
import type { PracticeEntry } from "@/core/components/practice/practice-queue";
import { agentJson, agentWorkerUrl } from "@/core/lib/agent-client";
import { isCorrectChoice } from "@/core/components/practice/meaning-questions";

export const ROOM_MAX_QUESTIONS = 50;
export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

/** What every player sees of a question. The answer is never part of it. */
interface LiveQuestion {
  type: PracticeQuestionTask;
  prompt: string;
  options: string[];
  blank?: number;
  passage?: { id: string; title: string; text: string };
  sharedBank?: boolean;
}

export interface RoomPlayer {
  uid: string;
  name: string;
  score: number;
  connected: boolean;
  answered: boolean;
}

interface RoomReviewItem {
  index: number;
  question: Omit<LiveQuestion, "passage"> & { passageId: string | null };
  choice: number | null;
  accepted: number[];
  explanation: string | null;
}

export interface RoomReview {
  items: RoomReviewItem[];
  passages: Record<string, { title: string; text: string }>;
}

type RoomPhase = "lobby" | "question" | "reveal" | "ended";

export interface RoomState {
  type: "state";
  serverNow: number;
  code: string;
  title: string;
  hostUid: string;
  you: string;
  phase: RoomPhase;
  index: number;
  total: number;
  endsAt: number | null;
  duration: number | null;
  players: RoomPlayer[];
  question: LiveQuestion | null;
  yourChoice: number | null;
  revealedBlanks: Record<number, string>;
  /** Your wrong or missed questions, sent once the game has ended. */
  review?: RoomReview | null;
  reveal: {
    answerIndex: number;
    accepted: number[];
    explanation: string | null;
    gained: Record<string, number>;
    choices: Record<string, number>;
  } | null;
}

/**
 * The host's own questions, split into what players see and what only the
 * room's server keeps.
 */
export function toRoomQuestions(entries: readonly PracticeEntry[]) {
  return entries.slice(0, ROOM_MAX_QUESTIONS).map(({ item }) => {
    const passage = item.question?.kind === "reading" ? item.question : null;
    const display: LiveQuestion = {
      type: item.type,
      prompt: item.prompt,
      options: [...item.options],
      ...(item.blank ? { blank: item.blank } : {}),
      ...(passage
        ? {
            passage: {
              id: passage.id,
              title: passage.title,
              text: passage.passage,
            },
          }
        : {}),
      ...(item.optionBank ? { sharedBank: true } : {}),
    };
    const accepted = item.options.flatMap((_, index) =>
      index !== item.answerIndex && isCorrectChoice(item, index) ? [index] : [],
    );
    return {
      display,
      answerIndex: item.answerIndex,
      ...(accepted.length ? { accepted } : {}),
      ...(item.explanation ? { explanation: item.explanation } : {}),
    };
  });
}

export async function createRoom(input: {
  name: string;
  title: string;
  seconds: number;
  questions: ReturnType<typeof toRoomQuestions>;
}) {
  const created = await agentJson<{ code: string }>("/rooms", {
    method: "POST",
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(30_000),
  });
  activeRoomCheck = null;
  return created;
}

type ActiveRoomResponse = {
  room: { code: string; title: string; phase: string } | null;
};

/**
 * Each check wakes up to two Durable Objects, and screens ask on every focus
 * and return to the foreground. One answer per account serves them for a
 * minute; creating a room here asks again.
 */
export const ACTIVE_ROOM_CHECK_MS = 60_000;
let activeRoomCheck: {
  uid: string;
  at: number;
  response: Promise<ActiveRoomResponse>;
} | null = null;

/** The room this person is hosting right now, if any, so this device can take it over. */
export function fetchActiveRoom(uid: string, now = Date.now()) {
  if (
    activeRoomCheck?.uid === uid &&
    now - activeRoomCheck.at < ACTIVE_ROOM_CHECK_MS
  )
    return activeRoomCheck.response;
  const response = agentJson<ActiveRoomResponse>("/rooms/active", {
    method: "GET",
  });
  const check = { uid, at: now, response };
  activeRoomCheck = check;
  // A failed check is not worth remembering.
  response.catch(() => {
    if (activeRoomCheck === check) activeRoomCheck = null;
  });
  return response;
}

export function requestRoomTicket(code: string, name: string) {
  return agentJson<{ ticket: string }>(
    `/rooms/${encodeURIComponent(code)}/ticket`,
    { method: "POST", body: JSON.stringify({ name }) },
  );
}

export function roomSocketUrl(code: string, ticket: string) {
  const url = new URL(
    `${agentWorkerUrl()}/rooms/${encodeURIComponent(code)}/ws`,
  );
  return `${url.toString().replace(/^http/u, "ws")}?ticket=${encodeURIComponent(ticket)}`;
}

export function normalizeRoomCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}
