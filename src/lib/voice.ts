import type { Tables } from "@/integrations/supabase/types";

export type VoiceCall = Tables<"voice_calls">;
export const RING_SECONDS = 45;
export const HEARTBEAT_MS = 10000;
export function isLiveCall(call: Pick<VoiceCall, "status">) {
  return call.status === "ringing" || call.status === "accepted";
}
export function callExpired(call: Pick<VoiceCall, "expires_at">, now = Date.now()) {
  return Date.parse(call.expires_at) <= now;
}

/** One browser media session; dispose is safe on every exit and while permission is pending. */
export class VoiceMedia {
  peer: RTCPeerConnection | null = null;
  stream: MediaStream | null = null;
  remote = new MediaStream();
  disposed = false;
  pending: RTCIceCandidateInit[] = [];
  async open(servers: RTCIceServer[]) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    if (this.disposed) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("call_cancelled");
    }
    this.stream = stream;
    this.peer = new RTCPeerConnection({ iceServers: servers });
    stream.getAudioTracks().forEach((track) => this.peer?.addTrack(track, stream));
    return this.peer;
  }
  async description(value: RTCSessionDescriptionInit) {
    const peer = this.peer;
    if (!peer || this.disposed) return;
    if (!peer.remoteDescription) await peer.setRemoteDescription(value);
    for (const candidate of this.pending.splice(0)) await peer.addIceCandidate(candidate);
  }
  async candidate(value: RTCIceCandidateInit) {
    if (this.disposed) return;
    if (this.peer?.remoteDescription) await this.peer.addIceCandidate(value);
    else this.pending.push(value);
  }
  mute(muted: boolean) {
    this.stream?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
  }
  dispose() {
    this.disposed = true;
    if (this.peer) {
      this.peer.ontrack = null;
      this.peer.onicecandidate = null;
      this.peer.onconnectionstatechange = null;
      this.peer.close();
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.remote.getTracks().forEach((track) => track.stop());
    this.peer = null;
    this.stream = null;
    this.pending = [];
  }
}