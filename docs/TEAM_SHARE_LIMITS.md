# Team share: size limits (measured, v3.3.0)

How it works: a section's list is packed into the link itself, after `#s=` (the hash is never sent to
any server). JSON → UTF-8 → deflate-raw (`CompressionStream`) → base64url, prefix `z`
(`j` = uncompressed fallback for browsers without `CompressionStream`). The QR code is drawn on the
page by the bundled qrcode-generator 2.0.4 (MIT); no QR web service is called.

## Limits

| Limit | Value | Where it comes from |
|---|---|---|
| One QR code (version 40, low error correction, byte mode) | **2,953 characters of link**: 2,953 fit, 2,954 do not (tested) | QR standard capacity |
| Typical tasks per QR code | **about 200** (≈ 2,880 chars, version 40) | measured with varied, realistic rows |
| Comfortable scanning | **under about 1,200 characters ≈ 60–70 tasks** (version ≤ 25); above this the dialog says "dense: if it won't scan, send the link" | phone-camera experience; `SHARE_CONFIG.qrComfortChars` |
| Split | up to **8 QR codes** ("Part 1 of N"), each a complete read-only list for its rows: about **1,600 tasks** | `SHARE_CONFIG.maxParts` |
| Bigger than that | no QR; the dialog warns and offers **Copy link** only | |
| Link length itself | about 10 characters per task after compression (4,000 tasks ≈ 40,000 chars). Browsers accept far longer; some chat apps cut very long links, so the dialog suggests email above 8,000 characters | measured |

Measured link length (link includes `https://autoprod-dev.github.io/prepline-test/index.html#s=`-sized base):

| Tasks | JSON bytes | Link chars | QR version |
|---:|---:|---:|---:|
| 5 | 846 | 422 | 13 |
| 10 | 1,063 | 525 | 16 |
| 20 | 1,521 | 717 | 18 |
| 30 | 1,912 | 838 | 20 |
| 50 | 2,927 | 1,145 | 24 |
| 80 | 4,393 | 1,526 | 28 |
| 100 | 5,229 | 1,776 | 31 |
| 150 | 7,498 | 2,334 | 36 |
| 200 | 9,907 | 2,880 | 40 |
| 300 | 14,427 | 3,865 | too big: split into 2 |

Sample menu, Vegetables section (11 tasks): 512 characters, QR version 15.

The tests (`tests/v3/test_v33.py`) re-measure all of this on every run and decode a real QR code
with OpenCV to check it scans to the exact link.

## Notes
- The shared view is a snapshot. Share again after changes.
- The phone needs nothing installed or stored; the shared view reads and writes no storage.
  Ticks live in memory only while the page is open.
- A copy opened from a file (offline build) has no web address, so its links point to
  `SHARE_CONFIG.fallbackUrl` (currently the test site).
