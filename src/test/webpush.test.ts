// @vitest-environment node
import { describe, expect, it } from "vitest";
import { b64urlDecode, b64urlEncode, encryptPayload, vapidJwt } from "@/lib/webpush";

const te = new TextEncoder();
const buf = (u: Uint8Array) => u as unknown as BufferSource;

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const k = await crypto.subtle.importKey("raw", buf(ikm), "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: buf(salt), info: buf(info) }, k, len * 8),
  );
}

describe("web push encryption", () => {
  it("produces aes128gcm data the browser (subscriber) can decrypt", async () => {
    // Simulate the browser's subscription keys.
    const ua = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair;
    const uaPub = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey));
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const msg = JSON.stringify({ title: "Привіт", url: "/chats/abc" });

    const record = await encryptPayload(te.encode(msg), b64urlEncode(uaPub), b64urlEncode(auth));

    // Decrypt as the user agent would (RFC 8291).
    const salt = record.slice(0, 16);
    const idlen = record[20]!;
    const asPub = record.slice(21, 21 + idlen);
    const cipher = record.slice(21 + idlen);
    const asKey = await crypto.subtle.importKey("raw", buf(asPub), { name: "ECDH", namedCurve: "P-256" }, false, []);
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, ua.privateKey, 256));
    const info = new Uint8Array([...te.encode("WebPush: info\0"), ...uaPub, ...asPub]);
    const ikm = await hkdf(auth, shared, info, 32);
    const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
    const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
    const aes = await crypto.subtle.importKey("raw", buf(cek), "AES-GCM", false, ["decrypt"]);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf(nonce) }, aes, buf(cipher)));

    expect(plain.at(-1)).toBe(2);
    expect(new TextDecoder().decode(plain.slice(0, -1))).toBe(msg);
  });
});

describe("VAPID JWT", () => {
  it("is ES256-signed and verifiable with the public key", async () => {
    const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
    const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);

    const jwt = await vapidJwt("https://fcm.googleapis.com", "mailto:a@b.co", b64urlEncode(pub), jwk.d!, 1000);
    const [h, c, s] = jwt.split(".");
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(c!)));
    expect(claims).toEqual({ aud: "https://fcm.googleapis.com", exp: 1000 + 43200, sub: "mailto:a@b.co" });
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      kp.publicKey,
      buf(b64urlDecode(s!)),
      buf(te.encode(`${h}.${c}`)),
    );
    expect(ok).toBe(true);
  });

  it("rejects a malformed public key", async () => {
    await expect(vapidJwt("https://x", "mailto:a@b.co", b64urlEncode(new Uint8Array(10)), "x")).rejects.toThrow();
  });
});
