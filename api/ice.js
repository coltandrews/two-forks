// Returns ICE servers for WebRTC. With Cloudflare TURN credentials set in
// the Vercel project (TURN_KEY_ID and TURN_KEY_API_TOKEN), it mints
// short-lived TURN credentials so the two laptops can connect even on
// networks that block direct peer-to-peer traffic. Without them it returns
// public STUN only, which works on most home networks.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const id = process.env.TURN_KEY_ID;
  const token = process.env.TURN_KEY_API_TOKEN;
  if (id && token) {
    try {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: 86400 }),
      });
      if (r.ok) {
        const j = await r.json();
        const servers = Array.isArray(j.iceServers) ? j.iceServers : [j.iceServers];
        res.status(200).json({ iceServers: servers, turn: true });
        return;
      }
    } catch (e) {
      // Fall through to STUN.
    }
  }
  res.status(200).json({
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ],
    turn: false,
  });
}
