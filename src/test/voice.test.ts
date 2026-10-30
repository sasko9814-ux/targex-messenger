import { describe, expect, it, vi, afterEach } from "vitest";
import { VoiceMedia, VoiceIceQueue, canApplyCall, callExpired, type VoiceCall } from "@/lib/voice";
import { callCandidateSchema, callDescriptionSchema } from "@/lib/validation";

afterEach(() => vi.unstubAllGlobals());
describe("voice signaling", () => {
  it("sends buffered and later ICE in order", async () => {
    const sent: string[] = [];
    const queue = new VoiceIceQueue(async (value) => { sent.push(value.candidate ?? ""); }, () => {});
    queue.push({ candidate: "first" }); queue.bind("call"); queue.push({ candidate: "second" });
    await queue.settled(); expect(sent).toEqual(["first", "second"]);
  });
  it("does not send disposed session candidates", async () => {
    const send = vi.fn(); const queue = new VoiceIceQueue(send, () => {});
    queue.push({ candidate: "old" }); queue.bind("old"); queue.dispose();
    await queue.settled(); expect(send).not.toHaveBeenCalled();
  });
  it("does not downgrade accepted state from a delayed ringing snapshot", () => {
    const accepted = { id: "a", status: "accepted" } as VoiceCall;
    expect(canApplyCall(accepted, { ...accepted, status: "ringing" })).toBe(false);
    expect(canApplyCall(accepted, { ...accepted, status: "ended" })).toBe(true);
    expect(canApplyCall(accepted, { ...accepted, id: "b" })).toBe(false);
  });
  it("expires exactly at the server deadline", () => {
    const value = { expires_at: "2026-10-30T10:00:45Z" };
    expect(callExpired(value, Date.parse("2026-10-30T10:00:44Z"))).toBe(false);
    expect(callExpired(value, Date.parse("2026-10-30T10:00:45Z"))).toBe(true);
  });
  it("rejects blank SDP and missing or oversized ICE", () => {
    expect(callDescriptionSchema.safeParse({ type: "offer", sdp: " " }).success).toBe(false);
    expect(callCandidateSchema.safeParse({}).success).toBe(false);
    expect(callCandidateSchema.safeParse({ candidate: "x".repeat(4097) }).success).toBe(false);
    expect(callCandidateSchema.safeParse({ candidate: "" }).success).toBe(true);
  });
});
describe("voice media cleanup", () => {
  it("stops a microphone granted after cancellation", async () => {
    const stop = vi.fn();
    let resolve: ((value: MediaStream) => void) | undefined;
    vi.stubGlobal("MediaStream", class { getTracks() { return []; } });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: () => new Promise<MediaStream>((done) => { resolve = done; }) } });
    const media = new VoiceMedia(); const opening = media.open([]);
    media.dispose();
    resolve?.({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    await expect(opening).rejects.toThrow("call_cancelled"); expect(stop).toHaveBeenCalledOnce();
  });
  it("mutes tracks and closes media on exit", () => {
    vi.stubGlobal("MediaStream", class { getTracks() { return []; } });
    const track = { enabled: true, stop: vi.fn() }; const close = vi.fn();
    const media = new VoiceMedia();
    media.stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
    media.peer = { close } as unknown as RTCPeerConnection;
    media.mute(true); expect(track.enabled).toBe(false);
    media.mute(false); expect(track.enabled).toBe(true);
    media.dispose(); expect(close).toHaveBeenCalledOnce(); expect(track.stop).toHaveBeenCalledOnce();
  });
});