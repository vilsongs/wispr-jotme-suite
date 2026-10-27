/** Canais e tipos compartilhados entre o processo principal e as janelas. */

import type { MeetingRecord } from "../core/meetings";
import type { LiveSessionSnapshot } from "../core/meetingSession";
import type { Speaker } from "../core/segmenter";
import type { Settings } from "../core/settings";

export const IPC = {
  recorderCmd: "recorder:cmd",
  recorderReply: "recorder:reply",
  recorderSegment: "recorder:segment",
  recorderLevels: "recorder:levels",
  liveState: "live:state",
  liveLevels: "live:levels",
  liveMode: "live:mode",
  liveAction: "live:action",
  hubGetState: "hub:get-state",
  hubStateChanged: "hub:state-changed",
  hubLevels: "hub:levels",
  hubStartMeeting: "hub:start-meeting",
  hubPauseMeeting: "hub:pause-meeting",
  hubResumeMeeting: "hub:resume-meeting",
  hubStopMeeting: "hub:stop-meeting",
  hubUpdateLiveMeta: "hub:update-live-meta",
  hubSaveSettings: "hub:save-settings",
  hubUpdateMeeting: "hub:update-meeting",
  hubDeleteMeeting: "hub:delete-meeting",
  hubExportMeeting: "hub:export-meeting",
  hubCopyMeeting: "hub:copy-meeting",
} as const;

export type RecorderCommand = "start" | "pause" | "resume" | "stop";

export type EngineStatus =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

export interface AudioLevels {
  you: number;
  them: number;
}

export interface RecorderSegmentPayload {
  speaker: Speaker;
  samples: Float32Array | ArrayBuffer;
}

export interface HubState {
  engineStatus: EngineStatus;
  modelName: string;
  settings: Settings;
  session: LiveSessionSnapshot;
  meetings: readonly MeetingRecord[];
}
